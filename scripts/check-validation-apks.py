"""Cloud-only: preserve real APK publisher and require increasing version code."""
import json, os, pathlib, re, subprocess
root = pathlib.Path('.verification/updater-validation')
tools = pathlib.Path(os.environ['ANDROID_HOME']) / 'build-tools/36.0.0'
expected = json.loads(pathlib.Path('src-tauri/android/release-signing.json').read_text())['certificateSha256'].lower()
codes = []
for folder, version in [('baseline', '99.0.1'), ('target', '99.0.2')]:
    apk = next((root / folder).glob('*.apk'))
    signature = subprocess.check_output([str(tools / 'apksigner'), 'verify', '--verbose', '--print-certs', str(apk)], text=True)
    match = re.search(r'Signer #1 certificate SHA-256 digest: ([0-9a-fA-F]+)', signature)
    if not match or match.group(1).lower() != expected: raise RuntimeError('Validation APK changed publisher')
    badging = subprocess.check_output([str(tools / 'aapt'), 'dump', 'badging', str(apk)], text=True)
    if "name='app.yakumo.client.updatervalidation'" not in badging or f"versionName='{version}'" not in badging: raise RuntimeError('Wrong isolated package identity/version')
    codes.append(int(re.search(r"versionCode='(\d+)'", badging).group(1)))
if codes[1] <= codes[0]: raise RuntimeError('Validation target version code did not increase')
print('Both APKs retain the registered release certificate and increasing version codes')
