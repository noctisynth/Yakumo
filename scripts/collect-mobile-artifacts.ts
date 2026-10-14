import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { checkVersions, filesRecursively } from './release-tools';

const mode = process.argv[2];
if (mode !== 'debug' && mode !== 'release')
  throw new Error('Expected debug or release');
const version = checkVersions();
const output = join('artifacts', `android-${mode}`);
mkdirSync(output, { recursive: true });
const hashes: string[] = [];
for (const ext of mode === 'release' ? ['apk', 'aab'] : ['apk']) {
  const sources = filesRecursively(
    join(
      'src-tauri/gen/android/app/build/outputs',
      ext === 'apk' ? 'apk' : 'bundle',
    ),
  ).filter((p) => p.endsWith(`.${ext}`) && p.toLowerCase().includes(mode));
  if (sources.length !== 1)
    throw new Error(`Expected one ${mode} ${ext}, found ${sources.length}`);
  const target = join(
    output,
    `Yakumo-${version}-android-universal${mode === 'debug' ? '-debug' : ''}.${ext}`,
  );
  copyFileSync(sources[0], target);
  hashes.push(
    `${createHash('sha256').update(readFileSync(target)).digest('hex')}  ${basename(target)}`,
  );
}
writeFileSync(
  join(
    output,
    `Yakumo-${version}-android${mode === 'debug' ? '-debug' : ''}.sha256`,
  ),
  `${hashes.join('\n')}\n`,
);
console.log(`Collected Android ${mode} artifacts`);
