import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const repository = 'noctisynth/Yakumo';
export const channelBranch = 'update-channel';
export const updaterRevision = 'eed469a618e169af19a2aa28759841bc73e469ed';
export const artifactPlatforms = {
  'windows-x86_64': 'windows-x64.exe',
  'linux-x86_64-appimage': 'linux-x64.AppImage',
  'linux-x86_64-deb': 'linux-x64.deb',
  'darwin-aarch64': 'macos-arm64.app.tar.gz',
  'darwin-x86_64': 'macos-x64.app.tar.gz',
  'android-aarch64': 'android-universal.apk',
  'android-x86_64': 'android-universal.apk',
} as const;

export function artifactUrl(version: string, filename: string): string {
  if (
    !/^\d+\.\d+\.\d+$/.test(version) ||
    !Object.values(artifactPlatforms).some(
      (suffix) => filename === `Yakumo-${version}-${suffix}`,
    )
  )
    throw new Error('Invalid release version or artifact filename');
  return `https://github.com/${repository}/releases/download/yakumo-v${version}/${filename}`;
}

export function mirrorUrl(template: string, original: string): string {
  const url = new URL(original);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Only public HTTPS resources may use mirrors');
  if (!template.includes('{{url}}') && !template.includes('{{encoded_url}}'))
    throw new Error('Missing mirror URL placeholder');
  const result = template
    .replaceAll('{{url}}', original)
    .replaceAll('{{encoded_url}}', encodeURIComponent(original));
  if (new URL(result).protocol !== 'https:')
    throw new Error('Mirror must use HTTPS');
  return result;
}

export function validateUpdaterConfiguration() {
  const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'))
    .plugins.updater;
  if (
    !config.requireSignedVersion ||
    config.retryOnVerificationFailure ||
    config.allowDowngrades ||
    config.timeout !== 15000
  )
    throw new Error('Unsafe updater policy');
  if (
    config.endpoints.length < 3 ||
    config.downloadUrlTemplates.at(-1) !== '{{url}}'
  )
    throw new Error('Mirrors and official fallback required');
  for (const endpoint of config.endpoints) mirrorUrl('{{url}}', endpoint);
  for (const template of config.downloadUrlTemplates)
    mirrorUrl(
      template,
      'https://github.com/noctisynth/Yakumo/releases/download/yakumo-v1.0.0/Yakumo-1.0.0-windows-x64.exe',
    );
  const source = JSON.parse(
    readFileSync('vendor/updater/package.json', 'utf8'),
  ).yakumoSource;
  if (
    source.revision !== updaterRevision ||
    createHash('sha256')
      .update(readFileSync('vendor/updater/index.ts'))
      .digest('hex') !== source.sha256
  )
    throw new Error('Vendored updater bindings differ from pinned revision');
  const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8');
  if (!cargo.includes(`rev = "${updaterRevision}"`))
    throw new Error('Rust and JS updater revisions differ');
  return config;
}

export interface Manifest {
  version: string;
  notes: string;
  platforms: Record<string, { url: string; signature: string }>;
}

export function generateManifest(
  version: string,
  notes: string,
  signature: (name: string) => string,
): Manifest {
  const platforms = Object.fromEntries(
    Object.entries(artifactPlatforms).map(([platform, suffix]) => {
      const filename = `Yakumo-${version}-${suffix}`;
      const signed = signature(filename).trim();
      const decoded = Buffer.from(signed, 'base64').toString('utf8');
      if (
        !decoded.startsWith('untrusted comment:') ||
        !decoded.includes(`\tversion:${version}\n`)
      )
        throw new Error(`Missing version-bound signature for ${platform}`);
      return [
        platform,
        { url: artifactUrl(version, filename), signature: signed },
      ];
    }),
  );
  return { version, notes, platforms };
}
