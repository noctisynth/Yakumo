"""Cloud-only release verification. Never reads signing passwords or private keys."""
import hashlib,json,os,pathlib,re,ssl,struct,subprocess,zipfile
root=pathlib.Path('src-tauri/gen/android/app/build/outputs')
apks=list((root/'apk').rglob('*release*.apk'));aabs=list((root/'bundle').rglob('*release*.aab'))
if len(apks)!=1 or len(aabs)!=1:raise RuntimeError('Expected exactly one release APK and AAB')
apk,aab=apks[0],aabs[0]
tools=pathlib.Path(os.environ['ANDROID_HOME'])/'build-tools'/'36.0.0'
def run(args):return subprocess.run([str(x) for x in args],check=True,capture_output=True,text=True).stdout
verification=run([tools/'apksigner','verify','--verbose','--print-certs',apk])
expected=json.loads(pathlib.Path('src-tauri/android/release-signing.json').read_text())['certificateSha256']
actual=re.search(r'Signer #1 certificate SHA-256 digest: ([0-9a-fA-F]+)',verification)
if not actual or actual.group(1).lower()!=expected.lower():raise RuntimeError('APK release signing identity mismatch')
for scheme in ['v2','v3']:
 if not re.search(r'Verified using '+scheme+r' scheme .*: true',verification):raise RuntimeError('APK missing required '+scheme+' signature')
run([tools/'zipalign','-c','-P','16','4',apk])
badging=run([tools/'aapt','dump','badging',apk])
if not re.search(r"package: name='app.yakumo.client'",badging):raise RuntimeError('Wrong application identifier')
if int(re.search(r"targetSdkVersion:'(\d+)'",badging).group(1))<35:raise RuntimeError('Android target SDK is outdated')
if int(re.search(r"(?m)^sdkVersion:'(\d+)'",badging).group(1))!=24:raise RuntimeError('Unexpected Android minimum SDK')
libraries=[]
with zipfile.ZipFile(apk) as package:
 for name in package.namelist():
  if not name.endswith('.so'):continue
  elf=package.read(name)
  if elf[:6]!=b'\x7fELF\x02\x01':raise RuntimeError('Expected little-endian ELF64 libraries')
  offset=struct.unpack_from('<Q',elf,32)[0];size,count=struct.unpack_from('<HH',elf,54)
  for n in range(count):
   header=offset+n*size
   if struct.unpack_from('<I',elf,header)[0]!=1:continue
   segment_offset,vaddr=struct.unpack_from('<QQ',elf,header+8);alignment=struct.unpack_from('<Q',elf,header+48)[0]
   if alignment<16384 or segment_offset%16384!=vaddr%16384:raise RuntimeError('ELF lacks 16 KB page alignment: '+name)
  libraries.append(name)
if not any('/arm64-v8a/' in name for name in libraries) or not any('/x86_64/' in name for name in libraries):raise RuntimeError('Required Android ABIs missing')
jar=run(['jarsigner','-verify',aab])
if 'jar verified' not in jar:raise RuntimeError('AAB signature verification failed')
certificates=run(['keytool','-printcert','-jarfile',aab,'-rfc'])
certificate=re.search(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----',certificates,re.S)
if not certificate or hashlib.sha256(ssl.PEM_cert_to_DER_cert(certificate.group(0))).hexdigest()!=expected:raise RuntimeError('AAB release signing identity mismatch')
report={'certificateSha256':expected,'apkSha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'schemes':['v2','v3'],'zipAlignment':'16 KB','libraries':libraries,'aabSignatureVerified':True}
output=pathlib.Path('artifacts/android-release');output.mkdir(parents=True,exist_ok=True);(output/'android-signature-verification.json').write_text(json.dumps(report,indent=2)+'\n')
print('Verified release identity, APK v2/v3, AAB signature and 16 KB ZIP/ELF alignment')
