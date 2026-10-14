import { describe, expect, test } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  checkVersions,
  releaseIntent,
  syncVersion,
  workspaceVersion,
} from './release-tools';

describe('release metadata', () => {
  test('accepts a shared prerelease version and rejects missing metadata', () => {
    expect(
      workspaceVersion('[workspace.package]\nversion = "0.1.0-alpha.0"'),
    ).toBe('0.1.0-alpha.0');
    expect(() => workspaceVersion('[package]\nversion = "0.1.0"')).toThrow();
    expect(() =>
      workspaceVersion('[workspace.package]\nversion = "unknown"'),
    ).toThrow();
  });

  test('does not publish before a version changelog exists', () => {
    expect(releaseIntent(1, '0.1.0', '')).toBe('version');
    expect(releaseIntent(0, '0.1.0', '')).toBe('idle');
    expect(releaseIntent(0, '0.1.0', '## v0.1.0-alpha.0\n')).toBe('idle');
    expect(releaseIntent(0, '0.1.0-alpha.0', '## v0.1.0-alpha.0\n')).toBe(
      'publish',
    );
  });

  test('syncs only the derived frontend version and catches a stale lockfile', () => {
    const directory = mkdtempSync(join(tmpdir(), 'yakumo-release-'));
    const root = pathToFileURL(`${directory}/`);
    try {
      mkdirSync(join(directory, 'src-tauri'));
      writeFileSync(
        join(directory, 'Cargo.toml'),
        '[workspace.package]\nversion="0.1.0-alpha.0"',
      );
      writeFileSync(
        join(directory, 'package.json'),
        JSON.stringify({
          name: 'yakumo',
          private: true,
          version: '0.1.0',
          scripts: { dev: 'vite' },
        }),
      );
      writeFileSync(
        join(directory, 'src-tauri', 'tauri.conf.json'),
        JSON.stringify({ version: '../package.json' }),
      );
      writeFileSync(
        join(directory, 'src-tauri', 'Cargo.toml'),
        '[package]\nversion.workspace=true\npublish=false',
      );
      writeFileSync(
        join(directory, 'Cargo.lock'),
        '[[package]]\nname="yakumo"\nversion="0.1.0"',
      );
      syncVersion(root);
      const synchronized = readFileSync(
        join(directory, 'package.json'),
        'utf8',
      );
      expect(JSON.parse(synchronized).scripts).toEqual({ dev: 'vite' });
      syncVersion(root);
      expect(readFileSync(join(directory, 'package.json'), 'utf8')).toBe(
        synchronized,
      );
      expect(() => checkVersions(root)).toThrow('must share');
      writeFileSync(
        join(directory, 'Cargo.lock'),
        '[[package]]\nname="yakumo"\nversion="0.1.0-alpha.0"',
      );
      expect(checkVersions(root)).toBe('0.1.0-alpha.0');
      writeFileSync(
        join(directory, 'src-tauri', 'tauri.conf.json'),
        JSON.stringify({ version: '0.1.0' }),
      );
      expect(() => checkVersions(root)).toThrow('must share');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
