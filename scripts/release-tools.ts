import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const repositoryRoot = new URL('../', import.meta.url);

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected an object in release metadata');
  }
  return value as Record<string, unknown>;
}

export function workspaceVersion(manifest: string): string {
  const parsed = record(Bun.TOML.parse(manifest));
  const version = record(record(parsed.workspace).package).version;
  if (
    typeof version !== 'string' ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)
  ) {
    throw new Error('The workspace must declare a semantic version');
  }
  return version;
}

export function synchronizePackage(manifest: string, version: string): string {
  const parsed = record(JSON.parse(manifest));
  if (parsed.name !== 'yakumo' || parsed.private !== true)
    throw new Error('Expected the private yakumo application package');
  parsed.version = version;
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function checkVersions(root: URL = repositoryRoot): string {
  const version = workspaceVersion(
    readFileSync(new URL('Cargo.toml', root), 'utf8'),
  );
  const frontend = record(
    JSON.parse(readFileSync(new URL('package.json', root), 'utf8')),
  );
  const tauri = record(
    JSON.parse(
      readFileSync(new URL('src-tauri/tauri.conf.json', root), 'utf8'),
    ),
  );
  const native = record(
    Bun.TOML.parse(readFileSync(new URL('src-tauri/Cargo.toml', root), 'utf8')),
  );
  const lock = record(
    Bun.TOML.parse(readFileSync(new URL('Cargo.lock', root), 'utf8')),
  );
  const packages = lock.package;
  if (!Array.isArray(packages))
    throw new Error('Cargo.lock has no package list');
  const locked = packages.map(record).find((entry) => entry.name === 'yakumo');
  if (
    frontend.version !== version ||
    frontend.private !== true ||
    frontend.name !== 'yakumo' ||
    tauri.version !== '../package.json' ||
    record(record(native.package).version).workspace !== true ||
    record(native.package).publish !== false ||
    locked?.version !== version
  ) {
    throw new Error(
      'Application manifests and Cargo.lock must share the workspace version',
    );
  }
  return version;
}

export function syncVersion(root: URL = repositoryRoot): void {
  const version = workspaceVersion(
    readFileSync(new URL('Cargo.toml', root), 'utf8'),
  );
  const path = new URL('package.json', root);
  const current = readFileSync(path, 'utf8');
  const next = synchronizePackage(current, version);
  if (current !== next) writeFileSync(path, next);
}

export function releaseIntent(
  pending: number,
  version: string,
  changelog: string,
): 'version' | 'publish' | 'idle' {
  if (pending > 0) return 'version';
  const marker = `## v${version}`;
  return changelog.split(/\r?\n/).some((line) => line.trim() === marker)
    ? 'publish'
    : 'idle';
}

export function pendingChangesets(root: URL = repositoryRoot): number {
  return readdirSync(new URL('.changes/', root)).filter(
    (name) => name.endsWith('.md') && name !== 'README.md',
  ).length;
}

export function filesRecursively(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? filesRecursively(path)
      : entry.isFile()
        ? [path]
        : [];
  });
}
