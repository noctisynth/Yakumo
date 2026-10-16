import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { filesRecursively } from './release-tools';
import { artifactUrl } from './updater-tools';

const name = process.argv[2];
const targets: Record<
  string,
  { target: string; bundles: string; suffix: string; platform: string }
> = {
  'windows-x64': {
    target: 'x86_64-pc-windows-msvc',
    bundles: 'nsis',
    suffix: 'windows-x64.exe',
    platform: 'windows-x86_64',
  },
  'linux-x64': {
    target: 'x86_64-unknown-linux-gnu',
    bundles: 'appimage',
    suffix: 'linux-x64.AppImage',
    platform: 'linux-x86_64-appimage',
  },
  'macos-arm64': {
    target: 'aarch64-apple-darwin',
    bundles: 'app',
    suffix: 'macos-arm64.app.tar.gz',
    platform: 'darwin-aarch64',
  },
  'macos-x64': {
    target: 'x86_64-apple-darwin',
    bundles: 'app',
    suffix: 'macos-x64.app.tar.gz',
    platform: 'darwin-x86_64',
  },
  android: {
    target: '',
    bundles: '',
    suffix: 'android-universal.apk',
    platform: 'android-x86_64',
  },
};
const settings = targets[name];
if (
  !settings ||
  !process.env.TAURI_SIGNING_PRIVATE_KEY ||
  !process.env.YAKUMO_UPDATER_PUBLIC_KEY
)
  throw new Error(
    'Validation platform and persistent updater signing identity required',
  );
const root = resolve('.verification/updater-validation');
mkdirSync(root, { recursive: true });
const clear = (directory: string) => {
  const path = resolve(directory);
  if (relative(process.cwd(), path).startsWith('..') || path === process.cwd())
    throw new Error('Refusing cleanup outside generated build outputs');
  rmSync(path, { recursive: true, force: true });
};
for (const version of ['99.0.2', '99.0.1']) {
  const config = join(root, 'build.json');
  writeFileSync(
    config,
    JSON.stringify({
      version,
      identifier: 'app.yakumo.client.updatervalidation',
      productName: 'YakumoUpdaterValidation',
    }),
  );
  if (name === 'android') {
    clear('src-tauri/gen/android/app/build/outputs');
    execFileSync(
      'bun',
      [
        'run',
        'tauri',
        'android',
        'build',
        '--ci',
        '--apk',
        '--target',
        'aarch64',
        'x86_64',
        '--features',
        'updater-validation',
        '--config',
        config,
      ],
      { stdio: 'inherit' },
    );
  } else {
    clear(join('target', settings.target, 'release/bundle'));
    execFileSync(
      'bun',
      [
        'run',
        'tauri',
        'build',
        '--target',
        settings.target,
        '--bundles',
        settings.bundles,
        '--features',
        'updater-validation',
        '--config',
        config,
      ],
      { stdio: 'inherit' },
    );
  }
  const folder = join(root, version === '99.0.2' ? 'target' : 'baseline');
  mkdirSync(folder, { recursive: true });
  const files = filesRecursively(
    name === 'android'
      ? 'src-tauri/gen/android/app/build/outputs/apk'
      : join('target', settings.target, 'release/bundle'),
  );
  if (name.startsWith('macos-')) {
    const binaries = files.filter((file) =>
      file.endsWith('/Contents/MacOS/yakumo'),
    );
    if (binaries.length !== 1)
      throw new Error('Expected one validation app bundle');
    const app = dirname(dirname(dirname(binaries[0])));
    if (version === '99.0.1')
      cpSync(app, join(folder, 'YakumoUpdaterValidation.app'), {
        recursive: true,
      });
    else
      execFileSync(
        'tar',
        [
          '-czf',
          join(folder, `Yakumo-${version}-${settings.suffix}`),
          '-C',
          dirname(app),
          basename(app),
        ],
        { env: { ...process.env, COPYFILE_DISABLE: '1' } },
      );
  } else {
    const extension =
      name === 'android'
        ? '.apk'
        : name === 'windows-x64'
          ? '.exe'
          : '.AppImage';
    const artifacts = files.filter((file) => file.endsWith(extension));
    if (artifacts.length !== 1)
      throw new Error('Expected one validation installation package');
    const destination = join(folder, `Yakumo-${version}-${settings.suffix}`);
    copyFileSync(artifacts[0], destination);
    if (name === 'linux-x64') chmodSync(destination, 0o755);
  }
}
const filename = `Yakumo-99.0.2-${settings.suffix}`;
const artifact = join(root, 'target', filename);
execFileSync(
  'bun',
  ['run', 'tauri', 'signer', 'sign', '--app-version', '99.0.2', artifact],
  { stdio: 'ignore', env: process.env },
);
const manifest = {
  version: '99.0.2',
  notes: 'Isolated installed-app upgrade verification',
  platforms: {
    [settings.platform]: {
      url: artifactUrl('99.0.2', filename),
      signature: readFileSync(`${artifact}.sig`, 'utf8').trim(),
    },
  },
};
writeFileSync(join(root, 'latest.json'), JSON.stringify(manifest));
console.log(
  'Isolated baseline/target built and target signed; no Release or update channel changed',
);
