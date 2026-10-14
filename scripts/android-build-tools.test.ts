import { expect, test } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const prepare = resolve('scripts/prepare-android.ts'),
  sign = resolve('scripts/configure-android-signing.ts');
function fixture(gradle: string) {
  const root = mkdtempSync(join(tmpdir(), 'yakumo-android-config-'));
  mkdirSync(join(root, 'src-tauri/gen/android/app/src/main'), {
    recursive: true,
  });
  mkdirSync(join(root, 'src-tauri/android'), { recursive: true });
  writeFileSync(
    join(root, 'src-tauri/android/VaultPlugin.kt'),
    '// synthetic source',
  );
  writeFileSync(
    join(root, 'src-tauri/gen/android/app/build.gradle.kts'),
    gradle,
  );
  writeFileSync(
    join(root, 'src-tauri/gen/android/app/src/main/AndroidManifest.xml'),
    '<manifest><application android:allowBackup="true" /></manifest>',
  );
  return root;
}
test('Android overlays preserve an existing NDK setting and scope cleartext', () => {
  const root = fixture(
    'android {\nndkVersion = "old"\ncompileSdk = 35\ndefaultConfig { targetSdk = 35 }\n}',
  );
  try {
    const result = Bun.spawnSync(['bun', prepare], { cwd: root });
    expect(result.exitCode).toBe(0);
    const gradle = readFileSync(
      join(root, 'src-tauri/gen/android/app/build.gradle.kts'),
      'utf8',
    );
    expect(gradle.match(/ndkVersion/g)?.length).toBe(1);
    expect(gradle).toContain('28.2.13676358');
    const xml = readFileSync(
      join(
        root,
        'src-tauri/gen/android/app/src/main/res/xml/network_security_config.xml',
      ),
      'utf8',
    );
    expect(xml).toContain('base-config cleartextTrafficPermitted="false"');
    expect(xml).toContain('tygl.swpu.edu.cn');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('release signing uses secrets without logging or duplicating imports', () => {
  const root = fixture(
    'import java.util.Properties\nandroid { buildTypes { getByName("release") { } } }',
  );
  try {
    const result = Bun.spawnSync(['bun', sign], {
      cwd: root,
      env: {
        ...process.env,
        ANDROID_KEY_BASE64:
          Buffer.from('synthetic-keystore').toString('base64'),
        ANDROID_KEY_PASSWORD: 'synthetic-password',
        ANDROID_KEY_ALIAS: 'synthetic',
        RUNNER_TEMP: root,
      },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).not.toContain('synthetic-password');
    const gradle = readFileSync(
      join(root, 'src-tauri/gen/android/app/build.gradle.kts'),
      'utf8',
    );
    expect(gradle.match(/import java.util.Properties/g)?.length).toBe(1);
    expect(gradle).toContain('enableV2Signing = true');
    expect(gradle).toContain('enableV3Signing = true');
    expect(gradle).toContain(
      'signingConfig = signingConfigs.getByName("yakumoRelease")',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('release signing fails closed when secrets are missing', () => {
  const root = fixture('android {}');
  try {
    const result = Bun.spawnSync(['bun', sign], {
      cwd: root,
      env: {
        ...process.env,
        ANDROID_KEY_BASE64: '',
        ANDROID_KEY_PASSWORD: '',
        ANDROID_KEY_ALIAS: '',
      },
    });
    expect(result.exitCode).not.toBe(0);
    expect(
      readFileSync(
        join(root, 'src-tauri/gen/android/app/build.gradle.kts'),
        'utf8',
      ),
    ).toBe('android {}');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
