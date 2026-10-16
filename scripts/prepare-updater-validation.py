"""Create disposable TLS fixture material, not an updater signing identity."""
import json, os, pathlib, shutil, subprocess
root = pathlib.Path('.verification/updater-validation').resolve()
root.mkdir(parents=True, exist_ok=True)
openssl = shutil.which('openssl') or str(pathlib.Path(os.environ.get('ProgramFiles', '')) / 'Git/usr/bin/openssl.exe')
def openssl_run(*arguments):
    subprocess.run([openssl, *arguments], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
openssl_run('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(root / 'ca.key'), '-out', str(root / 'ca.pem'), '-days', '2', '-subj', '/CN=Yakumo local validation CA', '-addext', 'basicConstraints=critical,CA:TRUE')
openssl_run('req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(root / 'https.key'), '-out', str(root / 'https.csr'), '-subj', '/CN=Yakumo local validation server')
(root / 'extensions.cnf').write_text('basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:ghfast.top,DNS:gh-proxy.com,DNS:github.com,DNS:raw.githubusercontent.com\n')
openssl_run('x509', '-req', '-in', str(root / 'https.csr'), '-CA', str(root / 'ca.pem'), '-CAkey', str(root / 'ca.key'), '-CAcreateserial', '-out', str(root / 'https.pem'), '-days', '2', '-extfile', str(root / 'extensions.cnf'))
(root / 'build.json').write_text(json.dumps({'version': '99.0.1', 'identifier': 'app.yakumo.client.updatervalidation', 'productName': 'YakumoUpdaterValidation'}))
with open(os.environ['GITHUB_ENV'], 'a') as env: env.write('YAKUMO_UPDATER_TEST_CA=' + str(root / 'ca.pem') + '\n')
print('Disposable HTTPS fixture CA prepared; production signing identity unchanged')
