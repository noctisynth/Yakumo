import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkVersions } from './release-tools';
import {
  artifactUrl,
  channelBranch,
  type Manifest,
  repository,
} from './updater-tools';

// This runs only after Semifold has successfully created and uploaded a new Release.
// It never creates, replaces or re-uploads a Release asset.
const directory = process.argv[2] ?? 'artifacts';
const version = checkVersions();
const manifestText = readFileSync(join(directory, 'latest.json'), 'utf8');
const manifest: Manifest = JSON.parse(manifestText);
if (manifest.version !== version) throw new Error('Manifest version mismatch');
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error('GitHub channel publication credential required');

interface GitHubData {
  draft: boolean;
  prerelease: boolean;
  tag_name: string;
  assets: { name: string; size: number; state: string }[];
  object: { sha: string };
  content: string;
  sha: string;
}

async function api(
  path: string,
  method = 'GET',
  body?: unknown,
  allow404 = false,
) {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (allow404 && response.status === 404) return null;
  if (!response.ok)
    throw new Error(`Channel API request failed (${response.status})`);
  return (await response.json()) as GitHubData;
}

const release = await api(`releases/tags/yakumo-v${version}`);
if (
  !release ||
  release.draft ||
  release.prerelease ||
  release.tag_name !== `yakumo-v${version}`
)
  throw new Error('Only a completed stable release may advance the channel');
const urls = new Set(
  Object.values(manifest.platforms).map((entry) => entry.url),
);
for (const url of urls) {
  const filename = url.split('/').at(-1) ?? '';
  if (url !== artifactUrl(version, filename))
    throw new Error('Unexpected updater URL');
  const asset = release.assets.find(
    (item: { name: string }) => item.name === filename,
  );
  const local = readFileSync(join(directory, filename));
  if (asset?.state !== 'uploaded' || asset.size !== local.length)
    throw new Error('Release updater assets are incomplete');
  // Public download deliberately has no Authorization header. Verify actual availability
  // and bytes, rather than trusting an API entry while its download is not ready.
  const response = await fetch(url, { signal: AbortSignal.timeout(600_000) });
  if (
    !response.ok ||
    !response.body ||
    new URL(response.url).protocol !== 'https:'
  )
    throw new Error('Published artifact is not ready');
  const remoteHash = createHash('sha256');
  for await (const chunk of response.body) remoteHash.update(chunk);
  if (
    remoteHash.digest('hex') !==
    createHash('sha256').update(local).digest('hex')
  )
    throw new Error('Published updater bytes differ');
}

const ref = await api(`git/ref/heads/${channelBranch}`, 'GET', undefined, true);
if (!ref) {
  const main = await api('git/ref/heads/main');
  if (!main) throw new Error('Missing main ref');
  await api('git/refs', 'POST', {
    ref: `refs/heads/${channelBranch}`,
    sha: main.object.sha,
  });
}
const existing = await api(
  `contents/latest.json?ref=${channelBranch}`,
  'GET',
  undefined,
  true,
);
if (existing) {
  const previous = JSON.parse(
    Buffer.from(existing.content, 'base64').toString('utf8'),
  ) as Manifest;
  const oldParts = previous.version.split('.').map(Number);
  const newParts = version.split('.').map(Number);
  const difference =
    newParts
      .map((part, index) => part - oldParts[index])
      .find((part) => part !== 0) ?? 0;
  if (!Number.isFinite(difference) || difference < 0)
    throw new Error('Cannot roll the update channel back');
  if (difference === 0) {
    if (JSON.stringify(previous) !== JSON.stringify(manifest))
      throw new Error('Cannot replace an existing version manifest');
    console.log('Update channel already points to this verified release');
    process.exit(0);
  }
}
await api('contents/latest.json', 'PUT', {
  branch: channelBranch,
  message: `chore: point updater to verified ${version}`,
  content: Buffer.from(manifestText).toString('base64'),
  ...(existing ? { sha: existing.sha } : {}),
});
console.log(`Update channel now points to verified release ${version}`);
