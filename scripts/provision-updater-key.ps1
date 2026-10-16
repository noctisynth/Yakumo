param([switch]$ConfigureGitHub, [switch]$VerifyOnly)
$ErrorActionPreference = 'Stop'
$repository = 'noctisynth/Yakumo'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$backupRoot = Join-Path $projectRoot '.signing-backup/updater'
$keyFile = Join-Path $backupRoot 'updater.key'
$passwordFile = Join-Path $backupRoot 'password.dpapi'
Set-Location -LiteralPath $projectRoot

function Invoke-PrivateProcess([string]$Executable, [string[]]$Arguments, [string]$InputText, [hashtable]$ExtraEnvironment) {
  $start = [Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $Executable
  $start.WorkingDirectory = $projectRoot
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $start.RedirectStandardInput = $true
  foreach ($argument in $Arguments) { $start.ArgumentList.Add($argument) }
  $start.Environment['GODEBUG'] = 'http2client=0'
  foreach ($name in $ExtraEnvironment.Keys) { $start.Environment[$name] = $ExtraEnvironment[$name] }
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $start
  [void]$process.Start()
  $outTask = $process.StandardOutput.ReadToEndAsync()
  $errTask = $process.StandardError.ReadToEndAsync()
  $process.StandardInput.Write($InputText)
  $process.StandardInput.Close()
  $process.WaitForExit()
  [void]$outTask.GetAwaiter().GetResult()
  [void]$errTask.GetAwaiter().GetResult()
  if ($process.ExitCode -ne 0) { throw "Private operation failed ($Executable, exit $($process.ExitCode)); output suppressed" }
}

if ($VerifyOnly -and !(Test-Path -LiteralPath $keyFile)) { throw 'No existing backup to verify' }
if (!(Test-Path -LiteralPath $keyFile) -and (Test-Path -LiteralPath (Join-Path $projectRoot 'src-tauri/updater-public-key.txt'))) { throw 'A trusted public key already exists; restore its original encrypted backup instead of generating a replacement' }
if (!(Test-Path -LiteralPath $backupRoot)) { [void][IO.Directory]::CreateDirectory($backupRoot) }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
Invoke-PrivateProcess 'icacls' @($backupRoot, '/inheritance:r', '/grant:r', "*$($identity.Value):(OI)(CI)F", '*S-1-5-18:(OI)(CI)F') '' @{}
$rules = (Get-Acl -LiteralPath $backupRoot).GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
foreach ($rule in $rules) {
  if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin @($identity.Value, 'S-1-5-18')) { throw 'Backup directory has unexpected access rules' }
}
if (!(Test-Path -LiteralPath $passwordFile)) {
  if (Test-Path -LiteralPath $keyFile) { throw 'Existing private key has no password backup; refusing replacement' }
  $random = [byte[]]::new(48)
  [Security.Cryptography.RandomNumberGenerator]::Fill($random)
  $password = [Convert]::ToBase64String($random)
  $bytes = [Text.Encoding]::UTF8.GetBytes($password)
  $protected = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  [IO.File]::WriteAllBytes($passwordFile, $protected)
} else {
  $bytes = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($passwordFile), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  $password = [Text.Encoding]::UTF8.GetString($bytes)
}
$privateEnvironment = @{ YAKUMO_KEY_DIRECTORY = $backupRoot; YAKUMO_KEY_PASSWORD = $password }
try {
  if (!(Test-Path -LiteralPath $keyFile)) {
    Invoke-PrivateProcess 'bun' @('scripts/updater-key-tool.ts', 'generate') '' $privateEnvironment
  }
  if (!(Test-Path -LiteralPath "$keyFile.pub")) { throw 'Missing public key; refusing replacement' }
  # Restore DPAPI material and prove the encrypted backup can actually sign.
  $restored = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($passwordFile), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  $privateEnvironment.YAKUMO_KEY_PASSWORD = [Text.Encoding]::UTF8.GetString($restored)
  Invoke-PrivateProcess 'bun' @('scripts/updater-key-tool.ts', 'verify') '' $privateEnvironment
  $publicKey = [IO.File]::ReadAllText("$keyFile.pub").Trim()
  $trustedPublicPath = Join-Path $projectRoot 'src-tauri/updater-public-key.txt'
  if ((Test-Path -LiteralPath $trustedPublicPath) -and [IO.File]::ReadAllText($trustedPublicPath).Trim() -ne $publicKey) { throw 'Backup public key differs from the trusted source; refusing replacement' }
  $fingerprint = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($publicKey))).ToLowerInvariant()
  $metadata = @{ schema = 1; repository = $repository; publicKeySha256 = $fingerprint; protection = 'Encrypted Tauri key; password protected by Windows CurrentUser DPAPI'; restoredSigningVerified = $true; createdUtc = (Get-Item -LiteralPath $keyFile).CreationTimeUtc.ToString('o') }
  [IO.File]::WriteAllText((Join-Path $backupRoot 'backup-info.json'), ($metadata | ConvertTo-Json))
  [IO.File]::WriteAllText((Join-Path $backupRoot 'RECOVERY.txt'), "Keep updater.key, updater.key.pub and password.dpapi together. Run scripts/provision-updater-key.ps1 -VerifyOnly from this Windows user to verify recovery. Password recovery depends on this Windows user profile; this is not an off-device disaster backup. Never commit this directory. Do not replace the signing key after clients trust its public key.")
  if (!$VerifyOnly) { [IO.File]::WriteAllText((Join-Path $projectRoot 'src-tauri/updater-public-key.txt'), "$publicKey`n") }
  if ($ConfigureGitHub) {
    $remoteVariables = & gh variable list --repo $repository --json name,value 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Could not check existing public signing identity; no remote changes made' }
    $existingPublic = ($remoteVariables | ConvertFrom-Json | Where-Object name -eq 'UPDATER_PUBLIC_KEY').value
    if ($existingPublic -and $existingPublic.Trim() -ne $publicKey) { throw 'Remote public key differs; refusing implicit signing-key rotation' }
    Invoke-PrivateProcess 'gh' @('secret', 'set', 'TAURI_SIGNING_PRIVATE_KEY', '--repo', $repository) ([IO.File]::ReadAllText($keyFile).Trim()) @{}
    Invoke-PrivateProcess 'gh' @('secret', 'set', 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD', '--repo', $repository) $password @{}
    Invoke-PrivateProcess 'gh' @('variable', 'set', 'UPDATER_PUBLIC_KEY', '--repo', $repository) $publicKey @{}
  }
  Write-Output "Encrypted backup recovery verified. Public key SHA-256: $fingerprint"
  if ($ConfigureGitHub) { Write-Output 'GitHub updater Secrets and public variable configured.' }
} finally {
  if ($bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
  if ($restored) { [Array]::Clear($restored, 0, $restored.Length) }
  $privateEnvironment.Clear()
  $password = $null
}
