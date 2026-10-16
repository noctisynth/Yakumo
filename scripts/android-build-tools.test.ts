import { expect, test } from 'bun:test';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { iconDensities } from './android-icons';

const prepare = resolve('scripts/prepare-android.ts'),
  sign = resolve('scripts/configure-android-signing.ts');
function fixture(gradle: string) {
  const root = mkdtempSync(join(tmpdir(), 'yakumo-android-config-'));
  mkdirSync(join(root, 'src-tauri/gen/android/app/src/main'), {
    recursive: true,
  });
  mkdirSync(join(root, 'src-tauri/android'), { recursive: true });
  cpSync(
    resolve('src-tauri/icons/android'),
    join(root, 'src-tauri/icons/android'),
    {
      recursive: true,
    },
  );
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
function cleanup(root: string) {
  if (
    resolve(dirname(root)) !== resolve(tmpdir()) ||
    !basename(root).startsWith('yakumo-android-config-')
  )
    throw new Error('Unexpected test fixture path');
  rmSync(root, { recursive: true, force: true });
}

test('Android icons replace template resources and preserve unrelated resources', () => {
  const root = fixture('android {}');
  const resources = join(root, 'src-tauri/gen/android/app/src/main/res');
  try {
    for (const folder of [
      'mipmap-mdpi',
      'mipmap-anydpi-v26',
      'mipmap-anydpi-v33',
      'drawable',
    ]) {
      mkdirSync(join(resources, folder), { recursive: true });
    }
    writeFileSync(join(resources, 'mipmap-mdpi/ic_launcher.png'), 'template');
    writeFileSync(
      join(resources, 'mipmap-anydpi-v26/ic_launcher_round.xml'),
      '<template/>',
    );
    writeFileSync(
      join(resources, 'mipmap-anydpi-v33/ic_launcher.xml'),
      '<template/>',
    );
    writeFileSync(
      join(resources, 'drawable/ic_launcher_foreground.xml'),
      '<template/>',
    );
    writeFileSync(join(resources, 'drawable/keep.xml'), '<unrelated/>');
    const manifest = join(
      root,
      'src-tauri/gen/android/app/src/main/AndroidManifest.xml',
    );
    writeFileSync(
      manifest,
      '<manifest><application android:icon="@drawable/template" android:roundIcon="@drawable/template_round"><activity android:icon="@drawable/keep" /></application></manifest>',
    );
    for (let pass = 0; pass < 2; pass++) {
      const result = Bun.spawnSync(['bun', prepare], { cwd: root });
      expect(result.exitCode).toBe(0);
      for (const density of Object.keys(iconDensities)) {
        for (const name of [
          'ic_launcher',
          'ic_launcher_round',
          'ic_launcher_foreground',
        ]) {
          const relative = `mipmap-${density}/${name}.png`;
          expect(readFileSync(join(resources, relative))).toEqual(
            readFileSync(join(root, 'src-tauri/icons/android', relative)),
          );
        }
      }
      for (const name of ['ic_launcher', 'ic_launcher_round']) {
        expect(
          readFileSync(
            join(resources, `mipmap-anydpi-v26/${name}.xml`),
            'utf8',
          ),
        ).toContain('@mipmap/ic_launcher_foreground');
      }
      const xml = readFileSync(manifest, 'utf8');
      expect(xml).toContain('android:icon="@mipmap/ic_launcher"');
      expect(xml).toContain('android:roundIcon="@mipmap/ic_launcher_round"');
      expect(xml.match(/android:roundIcon=/g)?.length).toBe(1);
      expect(xml).toContain('<activity android:icon="@drawable/keep"');
    }
    expect(
      existsSync(join(resources, 'mipmap-anydpi-v33/ic_launcher.xml')),
    ).toBe(false);
    expect(
      existsSync(join(resources, 'drawable/ic_launcher_foreground.xml')),
    ).toBe(false);
    expect(readFileSync(join(resources, 'drawable/keep.xml'), 'utf8')).toBe(
      '<unrelated/>',
    );
  } finally {
    cleanup(root);
  }
});

test('missing brand icons fail before replacing generated resources', () => {
  const root = fixture('android {}');
  const folder = join(
    root,
    'src-tauri/gen/android/app/src/main/res/mipmap-mdpi',
  );
  try {
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'ic_launcher.png'), 'existing resource');
    rmSync(
      join(
        root,
        'src-tauri/icons/android/mipmap-mdpi/ic_launcher_foreground.png',
      ),
    );
    expect(Bun.spawnSync(['bun', prepare], { cwd: root }).exitCode).not.toBe(0);
    expect(readFileSync(join(folder, 'ic_launcher.png'), 'utf8')).toBe(
      'existing resource',
    );
  } finally {
    cleanup(root);
  }
});
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
    cleanup(root);
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
    cleanup(root);
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
    cleanup(root);
  }
});
