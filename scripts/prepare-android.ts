import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const root = 'src-tauri/gen/android';
const gradle = join(root, 'app/build.gradle.kts');
if (!existsSync(gradle))
  throw new Error('Run Tauri Android initialization in CI first');
const source = readFileSync(gradle, 'utf8');
let updated = source
  .replace(/compileSdk\s*=\s*\d+/, 'compileSdk = 36')
  .replace(/targetSdk\s*=\s*\d+/, 'targetSdk = 36');
updated = /^\s*ndkVersion\s*=.*$/m.test(updated)
  ? updated.replace(
      /^\s*ndkVersion\s*=.*$/m,
      '    ndkVersion = "28.2.13676358"',
    )
  : updated.replace(/(android\s*\{)/, '$1\n    ndkVersion = "28.2.13676358"');
writeFileSync(gradle, updated);
const kotlin = join(root, 'app/src/main/java/app/yakumo/vault');
mkdirSync(kotlin, { recursive: true });
copyFileSync(
  'src-tauri/android/VaultPlugin.kt',
  join(kotlin, 'VaultPlugin.kt'),
);
const manifest = join(root, 'app/src/main/AndroidManifest.xml');
let xml = readFileSync(manifest, 'utf8').replace(
  /android:allowBackup="[^"]*"/,
  'android:allowBackup="false"',
);
if (!xml.includes('android:allowBackup='))
  xml = xml.replace('<application', '<application android:allowBackup="false"');
xml = xml
  .replace(/android:networkSecurityConfig="[^"]*"/g, '')
  .replace(/android:usesCleartextTraffic="[^"]*"/g, '')
  .replace(
    '<application',
    '<application android:networkSecurityConfig="@xml/network_security_config"',
  );
writeFileSync(manifest, xml);
const resources = join(root, 'app/src/main/res/xml');
mkdirSync(resources, { recursive: true });
writeFileSync(
  join(resources, 'network_security_config.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<network-security-config><base-config cleartextTrafficPermitted="false"/><domain-config cleartextTrafficPermitted="true"><domain includeSubdomains="false">tygl.swpu.edu.cn</domain></domain-config></network-security-config>\n`,
);
const rules = join(root, 'app/proguard-rules.pro');
writeFileSync(
  rules,
  `${existsSync(rules) ? readFileSync(rules, 'utf8') : ''}\n-keep class app.yakumo.vault.** { *; }\n`,
);
console.log(
  'Android overlays applied (SDK 36 / NDK r28 / native vault / scoped HTTP)',
);
