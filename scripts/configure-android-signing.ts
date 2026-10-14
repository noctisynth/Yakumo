import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const encoded = process.env.ANDROID_KEY_BASE64,
  password = process.env.ANDROID_KEY_PASSWORD,
  alias = process.env.ANDROID_KEY_ALIAS,
  temp = process.env.RUNNER_TEMP;
if (!encoded || !password || !alias || !temp)
  throw new Error('Android release signing secrets are required');
if (!/^[A-Za-z0-9_-]+$/.test(alias) || /[\r\n\\]/.test(password))
  throw new Error('Invalid Android signing configuration');
const store = join(temp, 'yakumo-release.p12');
writeFileSync(store, Buffer.from(encoded, 'base64'), { mode: 0o600 });
const root = 'src-tauri/gen/android';
writeFileSync(
  join(root, 'keystore.properties'),
  `storeFile=${store}\nkeyAlias=${alias}\npassword=${password}\n`,
  { mode: 0o600 },
);
const file = join(root, 'app/build.gradle.kts');
let source = readFileSync(file, 'utf8');
if (!source.includes('getByName("release")'))
  throw new Error('Unknown Android release Gradle layout');
source = `import java.util.Properties\n${source}`;
source = source.replace(
  /android\s*\{/,
  `android {
    signingConfigs {
        create("yakumoRelease") {
            val properties = Properties().apply { rootProject.file("keystore.properties").inputStream().use { load(it) } }
            storeFile = file(properties.getProperty("storeFile"))
            keyAlias = properties.getProperty("keyAlias")
            keyPassword = properties.getProperty("password")
            storePassword = properties.getProperty("password")
            enableV1Signing = true
            enableV2Signing = true
            enableV3Signing = true
        }
    }
`,
);
source = source.replace(
  'getByName("release") {',
  'getByName("release") {\n            signingConfig = signingConfigs.getByName("yakumoRelease")',
);
writeFileSync(file, source);
console.log(
  'Stable Android release signing configured; no secret material printed',
);
