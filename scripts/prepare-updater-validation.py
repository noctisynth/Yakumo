"""Create disposable TLS fixture material, not an updater signing identity."""
import json, os, pathlib, shutil, subprocess
root = pathlib.Path('.verification/updater-validation').resolve()
root.mkdir(parents=True, exist_ok=True)
openssl = shutil.which('openssl') or str(pathlib.Path(os.environ.get('ProgramFiles', '')) / 'Git/usr/bin/openssl.exe')
subprocess.run([openssl, 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(root / 'https.key'), '-out', str(root / 'https.pem'), '-days', '2', '-subj', '/CN=Yakumo local validation', '-addext', 'subjectAltName=DNS:ghfast.top,DNS:gh-proxy.com,DNS:github.com,DNS:raw.githubusercontent.com'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
(root / 'build.json').write_text(json.dumps({'version': '99.0.1', 'identifier': 'app.yakumo.client.updatervalidation', 'productName': 'YakumoUpdaterValidation'}))
with open(os.environ['GITHUB_ENV'], 'a') as env: env.write('YAKUMO_UPDATER_TEST_CA=' + str(root / 'https.pem') + '\n')
print('Disposable HTTPS fixture CA prepared; production signing identity unchanged')
