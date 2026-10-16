import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  artifactPlatforms,
  artifactUrl,
  generateManifest,
  mirrorUrl,
  validateUpdaterConfiguration,
} from './updater-tools';

describe('updater routing and release metadata', () => {
  test('pinned Rust/JS bindings and production policy remain compatible', () => {
    const config = validateUpdaterConfiguration();
    const oldConfig = { pubkey: '', endpoints: [] };
    expect(Object.keys(oldConfig).every((key) => key in config)).toBe(true);
    expect(config.endpoints.at(-1)).toBe(
      'https://raw.githubusercontent.com/noctisynth/Yakumo/update-channel/latest.json',
    );
    expect(readFileSync('Cargo.lock', 'utf8')).toContain(
      'eed469a618e169af19a2aa28759841bc73e469ed',
    );
  });
  test('URL prefix preserves versioned release URL, encoding is explicit', () => {
    const url = artifactUrl('1.2.3', 'Yakumo-1.2.3-windows-x64.exe');
    expect(mirrorUrl('https://ghfast.top/{{url}}', url)).toBe(
      `https://ghfast.top/${url}`,
    );
    expect(mirrorUrl('https://proxy.invalid/?url={{encoded_url}}', url)).toBe(
      `https://proxy.invalid/?url=${encodeURIComponent(url)}`,
    );
    for (const invalid of [
      'http://github.com/file',
      'https://user:pass@github.com/file',
      'https://github.com/file?token=private',
      'https://github.com/file#fragment',
    ])
      expect(() => mirrorUrl('{{url}}', invalid)).toThrow();
    expect(() => mirrorUrl('https://proxy.invalid/', url)).toThrow();
    expect(() => artifactUrl('1.2.3', '../wrong.exe')).toThrow();
    expect(() =>
      artifactUrl('1.2.3-beta.1', 'Yakumo-1.2.3-beta.1-windows-x64.exe'),
    ).toThrow();
  });
  test('manifest requires every platform and version-bound signatures', () => {
    const signed = Buffer.from(
      'untrusted comment: synthetic metadata only\nnot-a-valid-crypto-signature\ntrusted comment: timestamp:0\tversion:1.2.3\n',
    ).toString('base64');
    const manifest = generateManifest('1.2.3', 'notes', () => signed);
    expect(Object.keys(manifest.platforms)).toEqual(
      Object.keys(artifactPlatforms),
    );
    expect(manifest.platforms['android-aarch64']).toEqual(
      manifest.platforms['android-x86_64'],
    );
    expect(() => generateManifest('1.2.4', '', () => signed)).toThrow();
    expect(() => generateManifest('1.2.3', '', () => '')).toThrow();
    // Cryptographic verification is separately mandatory in verify-update, before publication.
  });
});
