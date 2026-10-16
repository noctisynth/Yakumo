import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { checkVersions, filesRecursively } from './release-tools';
import {
  artifactPlatforms,
  validateUpdaterConfiguration,
} from './updater-tools';

validateUpdaterConfiguration();
const directory = process.argv[2];
if (
  !directory ||
  !process.env.TAURI_SIGNING_PRIVATE_KEY ||
  !process.env.YAKUMO_UPDATER_PUBLIC_KEY
)
  throw new Error('Release updater signing key and public key are required');
const version = checkVersions();
const files = filesRecursively(directory);
const expected = new Set(
  Object.values(artifactPlatforms).map(
    (suffix) => `Yakumo-${version}-${suffix}`,
  ),
);
let count = 0;
for (const file of files) {
  if (!expected.has(file.split(/[\\/]/).at(-1) ?? '')) continue;
  // Never include the private key or password in argv or console output.
  execFileSync(
    'bun',
    ['run', 'tauri', 'signer', 'sign', '--app-version', version, file],
    { stdio: ['ignore', 'ignore', 'ignore'], env: process.env },
  );
  if (!existsSync(join(`${file}.sig`)))
    throw new Error('Signer did not produce a signature');
  count++;
}
if (!count) throw new Error('No updater artifacts found to sign');
console.log(`Signed ${count} updater artifacts`);
