import { existsSync, readFileSync } from 'node:fs';
import {
  checkVersions,
  pendingChangesets,
  releaseIntent,
  repositoryRoot,
} from './release-tools';

const version = checkVersions();
const changelogPath = new URL('src-tauri/CHANGELOG.md', repositoryRoot);
const changelog = existsSync(changelogPath)
  ? readFileSync(changelogPath, 'utf8')
  : '';
const mode = releaseIntent(pendingChangesets(), version, changelog);

console.log(JSON.stringify({ version, tag: `yakumo-v${version}`, mode }));
