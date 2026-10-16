import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mirrorUrl, validateUpdaterConfiguration } from './updater-tools';

// Explicit manual network evidence only: no credentials, installs, or automatic CI requests.
const config = validateUpdaterConfiguration();
const sources = [
  'https://raw.githubusercontent.com/noctisynth/Yakumo/main/README.md',
  'https://github.com/noctisynth/Yakumo/releases/download/yakumo-v0.1.2/Yakumo-0.1.2-windows-x64.sha256',
  'https://github.com/noctisynth/Yakumo/releases/download/yakumo-v0.1.2/Yakumo-0.1.2-linux-x64.AppImage',
];
const results: unknown[] = [];
await Promise.all(
  sources.flatMap((source) =>
    config.downloadUrlTemplates.map(async (template: string) => {
      const url = mirrorUrl(template, source);
      const start = Date.now();
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(120_000),
        });
        const hash = createHash('sha256');
        let bytes = 0;
        if (response.ok && response.body)
          for await (const chunk of response.body) {
            bytes += chunk.length;
            hash.update(chunk);
          }
        const result = {
          source,
          route: new URL(url).host,
          status: response.status,
          redirected: response.redirected,
          finalHost: new URL(response.url).host,
          bytes,
          sha256: hash.digest('hex'),
          elapsedMs: Date.now() - start,
        };
        results.push(result);
        console.log(JSON.stringify(result));
      } catch (error) {
        const result = {
          source,
          route: new URL(url).host,
          error: error instanceof Error ? error.name : 'NetworkError',
          elapsedMs: Date.now() - start,
        };
        results.push(result);
        console.log(JSON.stringify(result));
      }
    }),
  ),
);
mkdirSync('.verification', { recursive: true });
writeFileSync(
  '.verification/updater-mirror-probes.json',
  JSON.stringify(
    {
      date: '2026-10-16',
      scope: 'Execution-host network only; not mainland or campus verification',
      results,
    },
    null,
    2,
  ),
);
