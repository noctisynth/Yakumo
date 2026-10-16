import { describe, expect, test } from 'bun:test';
import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater';
import { updateError } from '../src/services/update-service';
import { createUpdateStore } from '../src/stores/update-store';

function setup() {
  let installs = 0;
  let closes = 0;
  const candidate = {
    version: '1.2.3',
    currentVersion: '1.2.2',
    download: async (event?: (event: DownloadEvent) => void) => {
      event?.({ event: 'Started', data: { contentLength: 10 } });
      event?.({ event: 'Progress', data: { chunkLength: 20 } });
      event?.({ event: 'Finished' });
    },
    cancel: async () => {},
    install: async () => {
      installs++;
    },
    close: async () => {
      closes++;
    },
  };
  const service = {
    status: async () => ({
      supported: true,
      configured: true,
      version: '1.2.2',
      platform: 'windows',
    }),
    check: async (): Promise<Update | null> => candidate as Update,
    restart: async () => {},
  };
  const store = createUpdateStore(service);
  return {
    candidate,
    service,
    store,
    installs: () => installs,
    closes: () => closes,
  };
}

describe('update lifecycle', () => {
  test('startup checks once, transfer counts retries, install requires a separate action', async () => {
    const run = setup();
    let checks = 0;
    run.service.check = async () => {
      checks++;
      return run.candidate as Update;
    };
    await run.store.getState().initialize();
    await run.store.getState().initialize();
    expect(checks).toBe(1);
    expect(run.store.getState().phase).toBe('available');
    await run.store.getState().install();
    expect(run.installs()).toBe(0);
    await run.store.getState().download();
    expect(run.store.getState().transferred).toBe(20);
    expect(run.store.getState().phase).toBe('ready');
    expect(run.installs()).toBe(0);
    await run.store.getState().install();
    expect(run.installs()).toBe(1);
    expect(run.closes()).toBe(1);
  });
  test('no update and missing configuration do not download', async () => {
    const run = setup();
    run.service.check = async () => null;
    await run.store.getState().initialize();
    expect(run.store.getState().phase).toBe('current');
    const missing = setup();
    missing.service.status = async () => ({
      supported: true,
      configured: false,
      version: '1',
      platform: 'windows',
    });
    missing.service.check = async () => {
      throw new Error('must not check');
    };
    await missing.store.getState().initialize();
    expect(missing.store.getState().phase).toBe('idle');
  });
  test('cancel prevents install even when download resolves during cancellation', async () => {
    const run = setup();
    let resolve = () => {};
    run.candidate.download = () =>
      new Promise<void>((done) => {
        resolve = done;
      });
    await run.store.getState().initialize();
    const downloading = run.store.getState().download();
    await run.store.getState().cancel();
    resolve();
    await downloading;
    await run.store.getState().install();
    expect(run.installs()).toBe(0);
    expect(run.store.getState().phase).toBe('cancelled');
    expect(run.store.getState().candidate).toBeNull();
  });
  test('verification failure releases resources and cannot install', async () => {
    const run = setup();
    run.candidate.download = async () => {
      throw 'signature verification failed';
    };
    await run.store.getState().initialize();
    await run.store.getState().download();
    await run.store.getState().install();
    expect(run.store.getState().phase).toBe('error');
    expect(run.store.getState().error).toContain('签名');
    expect(run.installs()).toBe(0);
    expect(run.closes()).toBe(1);
  });
  test('system denial/cancellation are actionable and install can be retried', async () => {
    const run = setup();
    run.candidate.install = async () => {
      throw 'INSTALL_CANCELLED';
    };
    await run.store.getState().initialize();
    await run.store.getState().download();
    await run.store.getState().install();
    expect(run.store.getState().phase).toBe('ready');
    expect(run.store.getState().error).toContain('取消系统安装');
    expect(updateError('APK_SIGNER_MISMATCH')).toContain('身份');
    expect(updateError('INSTALL_PERMISSION_DENIED')).toContain('允许');
    expect(updateError('request timeout')).toContain('超时');
  });
});
