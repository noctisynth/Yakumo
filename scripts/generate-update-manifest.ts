import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkVersions } from './release-tools';
import {
  generateManifest,
  validateUpdaterConfiguration,
} from './updater-tools';

validateUpdaterConfiguration();
const directory = process.argv[2] ?? 'artifacts';
const version = checkVersions();
const changelog = readFileSync('src-tauri/CHANGELOG.md', 'utf8').replaceAll(
  '\r\n',
  '\n',
);
const notes = changelog
  .split(`## v${version}\n`)[1]
  ?.split('\n## v')[0]
  ?.trim();
if (!notes) throw new Error('Current version release notes are required');
const manifest = generateManifest(version, notes, (filename) =>
  readFileSync(join(directory, `${filename}.sig`), 'utf8'),
);
writeFileSync(
  join(directory, 'latest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
