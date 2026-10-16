import { expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';

test('dev server refuses every signing backup file through direct and filesystem URLs', async () => {
  mkdirSync('.signing-backup', { recursive: true });
  const path = resolve('.signing-backup/dev-server-canary.txt');
  const contents = `Synthetic exposure canary ${crypto.randomUUID()}`;
  writeFileSync(path, contents);
  const server = await createServer({
    configFile: resolve('vite.config.ts'),
    logLevel: 'silent',
    server: { port: 0, host: '127.0.0.1', strictPort: false },
  });
  try {
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string')
      throw new Error('No loopback dev-server address');
    for (const route of [
      '/.signing-backup/dev-server-canary.txt',
      `/@fs/${path.replaceAll('\\', '/')}`,
    ]) {
      const response = await fetch(`http://127.0.0.1:${address.port}${route}`);
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain(contents);
    }
  } finally {
    await server.close();
    rmSync(path, { force: true });
  }
}, 30_000);
