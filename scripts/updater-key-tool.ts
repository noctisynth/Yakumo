import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { run } from '@tauri-apps/cli';
import { checkVersions } from './release-tools';
import { artifactPlatforms } from './updater-tools';

// Called by the Windows provisioning script with stdout/stderr captured and
// discarded. Secret values stay in process memory/environment, never OS argv.
const directory = process.env.YAKUMO_KEY_DIRECTORY;
const password = process.env.YAKUMO_KEY_PASSWORD;
if (!directory || !password)
  throw new Error('Missing protected key configuration');
if (process.argv[2] === 'generate') {
  await run(
    [
      'signer',
      'generate',
      '--ci',
      '--password',
      password,
      '--write-keys',
      join(directory, 'updater.key'),
    ],
    'tauri',
  );
} else if (process.argv[2] === 'verify') {
  const output = resolve('.verification/long-term-key-proof');
  mkdirSync(output, { recursive: true });
  const env = {
    ...process.env,
    TAURI_SIGNING_PRIVATE_KEY: readFileSync(
      join(directory, 'updater.key'),
      'utf8',
    ).trim(),
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: password,
    YAKUMO_UPDATER_PUBLIC_KEY: readFileSync(
      join(directory, 'updater.key.pub'),
      'utf8',
    ).trim(),
  };
  const version = checkVersions();
  for (const suffix of new Set(Object.values(artifactPlatforms)))
    writeFileSync(
      join(output, `Yakumo-${version}-${suffix}`),
      `Non-installable long-term signature recovery proof: ${suffix}`,
    );
  for (const script of ['sign-updates.ts', 'generate-update-manifest.ts'])
    execFileSync('bun', [`scripts/${script}`, output], {
      env,
      stdio: 'ignore',
    });
  execFileSync(
    'cargo',
    ['run', '--quiet', '--locked', '--bin', 'verify-update', '--', output],
    { env, stdio: 'ignore' },
  );
} else throw new Error('Expected generate or verify');
