import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkVersions,
  filesRecursively,
  repositoryRoot,
} from './release-tools';

const platforms = {
  'windows-x64': { target: 'x86_64-pc-windows-msvc', extensions: ['.exe'] },
  'linux-x64': {
    target: 'x86_64-unknown-linux-gnu',
    extensions: ['.deb', '.AppImage'],
  },
  'macos-arm64': { target: 'aarch64-apple-darwin', extensions: ['.dmg'] },
  'macos-x64': { target: 'x86_64-apple-darwin', extensions: ['.dmg'] },
};

const name = process.argv[2];
if (!name || !Object.hasOwn(platforms, name))
  throw new Error('Expected a supported desktop platform');
const platform = platforms[name as keyof typeof platforms];
const version = checkVersions();
const root = fileURLToPath(repositoryRoot);
const sources = filesRecursively(
  join(root, 'target', platform.target, 'release', 'bundle'),
);
const output = join(root, 'artifacts', name);
mkdirSync(output, { recursive: true });
const checksums: string[] = [];

for (const extension of platform.extensions) {
  const matches = sources.filter((source) => source.endsWith(extension));
  if (matches.length !== 1)
    throw new Error(
      `Expected one ${extension} bundle for ${name}, found ${matches.length}`,
    );
  const destination = join(output, `Yakumo-${version}-${name}${extension}`);
  copyFileSync(matches[0], destination);
  checksums.push(
    `${createHash('sha256').update(readFileSync(destination)).digest('hex')}  ${basename(destination)}`,
  );
}

writeFileSync(
  join(output, `Yakumo-${version}-${name}.sha256`),
  `${checksums.join('\n')}\n`,
);
