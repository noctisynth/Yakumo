import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { checkVersions } from './release-tools';
import { artifactPlatforms } from './updater-tools';

// Synthetic release pipeline check only. The disposable private key is never
// printed, published, committed, or used for an application build or real update.
mkdirSync('.verification', { recursive: true });
const directory = mkdtempSync(resolve('.verification/updater-release-'));
const keyPath = join(directory, 'disposable-test-key');
const version = checkVersions();
const run = (args: string[], env = process.env) =>
  execFileSync('bun', args, { stdio: 'ignore', env });
try {
  run([
    'run',
    'tauri',
    'signer',
    'generate',
    '--ci',
    '--password',
    '',
    '--write-keys',
    keyPath,
  ]);
  const env = {
    ...process.env,
    TAURI_SIGNING_PRIVATE_KEY: readFileSync(keyPath, 'utf8').trim(),
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '',
    YAKUMO_UPDATER_PUBLIC_KEY: readFileSync(`${keyPath}.pub`, 'utf8').trim(),
  };
  for (const suffix of new Set(Object.values(artifactPlatforms)))
    writeFileSync(
      join(directory, `Yakumo-${version}-${suffix}`),
      `Synthetic non-installable updater fixture: ${suffix}`,
    );
  run(['scripts/sign-updates.ts', directory], env);
  rmSync(keyPath);
  run(['scripts/generate-update-manifest.ts', directory], env);
  execFileSync(
    'cargo',
    ['build', '--quiet', '--locked', '--bin', 'verify-update'],
    { stdio: 'ignore' },
  );
  const metadata = JSON.parse(
    execFileSync(
      'cargo',
      ['metadata', '--format-version=1', '--no-deps', '--locked'],
      { encoding: 'utf8' },
    ),
  );
  const executable = join(
    metadata.target_directory,
    'debug',
    process.platform === 'win32' ? 'verify-update.exe' : 'verify-update',
  );
  const verify = (settings = env) =>
    spawnSync(executable, [directory], { env: settings, stdio: 'ignore' })
      .status;
  if (verify() !== 0) throw new Error('Valid synthetic release did not verify');
  if (verify({ ...env, YAKUMO_UPDATER_PUBLIC_KEY: 'wrong-key' }) === 0)
    throw new Error('Wrong public key was accepted');
  writeFileSync(
    join(directory, `Yakumo-${version}-windows-x64.exe`),
    'tampered',
  );
  if (verify() === 0) throw new Error('Tampered updater artifact was accepted');
  console.log(
    'Synthetic updater release: sign, manifest, all-platform signatures, wrong-key and tamper rejection passed',
  );
} finally {
  // Exact file deletion only; retain non-sensitive diagnostics in the ignored folder.
  rmSync(keyPath, { force: true });
}
