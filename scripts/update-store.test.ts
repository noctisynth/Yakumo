import { describe, expect, test } from 'bun:test';
import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater';
import { createUpdateReminderStorage } from '../src/services/update-reminder-storage';
import { updateError } from '../src/services/update-service';
import { createUpdateStore } from '../src/stores/update-store';

function memoryReminders() {
  let versions: string[] = [];
  return {
    read: () => [...versions],
    write: (next: string[]) => {
      versions = [...next];
    },
  };
}

function setup(reminders = memoryReminders(), version = '1.2.3') {
  let installs = 0;
  let closes = 0;
  const candidate = {
    version,
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
  const store = createUpdateStore(service, reminders);
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
    expect(run.store.getState().reminderVersion).toBe('1.2.3');
    await run.store.getState().install();
    expect(run.installs()).toBe(0);
    await run.store.getState().download();
    expect(run.store.getState().transferred).toBe(20);
    expect(run.store.getState().phase).toBe('ready');
    expect(run.store.getState().reminderVersion).toBeNull();
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
    expect(run.store.getState().error).toContain('安全检查失败');
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
    expect(updateError('APK_SIGNER_MISMATCH')).toContain('安全检查失败');
    expect(updateError('INSTALL_PERMISSION_DENIED')).toContain('允许');
    expect(updateError('request timeout')).toContain('超时');
  });
});

describe('update reminders', () => {
  test('skipping survives restart without preventing manual checks, download or install', async () => {
    const reminders = memoryReminders();
    const first = setup(reminders);
    await first.store.getState().initialize();
    expect(first.store.getState().skipVersion('1.2.3')).toBe(true);
    expect(first.store.getState().reminderVersion).toBeNull();
    expect(first.store.getState().candidate).toBe(first.candidate as Update);
    expect(first.store.getState().phase).toBe('available');
    expect(first.closes()).toBe(0);
    expect(first.installs()).toBe(0);

    const restarted = setup(reminders);
    await restarted.store.getState().initialize();
    expect(restarted.store.getState().skippedVersions).toEqual(['1.2.3']);
    expect(restarted.store.getState().reminderVersion).toBeNull();
    expect(restarted.store.getState().phase).toBe('available');
    await restarted.store.getState().check();
    expect(restarted.store.getState().candidate).toBe(
      restarted.candidate as Update,
    );
    expect(restarted.store.getState().reminderVersion).toBeNull();
    await restarted.store.getState().download();
    expect(restarted.store.getState().phase).toBe('ready');
    await restarted.store.getState().install();
    expect(restarted.installs()).toBe(1);
  });

  test('a newer version prompts while all previously skipped versions remain suppressed', async () => {
    const reminders = memoryReminders();
    const first = setup(reminders);
    await first.store.getState().initialize();
    expect(first.store.getState().skipVersion('1.2.3')).toBe(true);

    const newer = setup(reminders, '1.3.0');
    await newer.store.getState().initialize();
    expect(newer.store.getState().reminderVersion).toBe('1.3.0');
    expect(newer.store.getState().skipVersion('1.3.0')).toBe(true);
    expect(reminders.read()).toEqual(['1.2.3', '1.3.0']);

    for (const version of ['1.2.3', '1.3.0']) {
      const cached = setup(reminders, version);
      await cached.store.getState().initialize();
      expect(cached.store.getState().reminderVersion).toBeNull();
      expect(cached.store.getState().candidate?.version).toBe(version);
    }
    const latest = setup(reminders, '1.3.1');
    await latest.store.getState().initialize();
    expect(latest.store.getState().reminderVersion).toBe('1.3.1');
  });

  test('later dismisses the version for this session but prompts after restart', async () => {
    const reminders = memoryReminders();
    const run = setup(reminders);
    await run.store.getState().initialize();
    run.store.getState().dismissReminder('1.2.3');
    expect(run.store.getState().reminderVersion).toBeNull();
    expect(run.store.getState().candidate).toBe(run.candidate as Update);
    expect(reminders.read()).toEqual([]);
    await run.store.getState().check({ notify: true });
    expect(run.store.getState().reminderVersion).toBeNull();

    run.candidate.version = '1.2.4';
    await run.store.getState().check({ notify: true });
    expect(run.store.getState().reminderVersion).toBe('1.2.4');
    run.store.getState().dismissReminder('1.2.4');
    run.candidate.version = '1.2.3';
    await run.store.getState().check({ notify: true });
    expect(run.store.getState().reminderVersion).toBeNull();

    const restarted = setup(reminders);
    await restarted.store.getState().initialize();
    expect(restarted.store.getState().reminderVersion).toBe('1.2.3');
  });

  test('manual check presents the candidate without opening an automatic reminder', async () => {
    const run = setup();
    run.service.check = async () => null;
    await run.store.getState().initialize();
    run.service.check = async () => run.candidate as Update;
    await run.store.getState().check();
    expect(run.store.getState().phase).toBe('available');
    expect(run.store.getState().candidate).toBe(run.candidate as Update);
    expect(run.store.getState().reminderVersion).toBeNull();
    expect(run.store.getState().skipVersion('1.2.3')).toBe(false);
    await run.store.getState().download();
    expect(run.store.getState().phase).toBe('ready');
  });

  test('old dialog actions cannot dismiss or skip a replacement candidate', async () => {
    const reminders = memoryReminders();
    const run = setup(reminders);
    await run.store.getState().initialize();
    let resolve: (candidate: Update) => void = () => {};
    const pending = new Promise<Update>((done) => {
      resolve = done;
    });
    run.service.check = () => pending;
    const checking = run.store.getState().check({ notify: true });
    expect(run.store.getState().phase).toBe('checking');
    expect(run.store.getState().reminderVersion).toBeNull();
    expect(run.store.getState().skipVersion('1.2.3')).toBe(false);
    run.store.getState().dismissReminder('1.2.3');
    resolve({ ...run.candidate, version: '1.2.4' } as Update);
    await checking;

    expect(run.store.getState().reminderVersion).toBe('1.2.4');
    expect(run.store.getState().skipVersion('1.2.3')).toBe(false);
    run.store.getState().dismissReminder('1.2.3');
    expect(run.store.getState().reminderVersion).toBe('1.2.4');
    expect(reminders.read()).toEqual([]);
    expect(run.store.getState().skipVersion('1.2.4')).toBe(true);
    expect(reminders.read()).toEqual(['1.2.4']);
  });

  test('failed persistence leaves the reminder actionable and supports retry', async () => {
    const reminders = memoryReminders();
    const write = reminders.write;
    reminders.write = () => {
      throw new Error('storage unavailable');
    };
    const run = setup(reminders);
    await run.store.getState().initialize();
    expect(run.store.getState().skipVersion('1.2.3')).toBe(false);
    expect(run.store.getState().reminderVersion).toBe('1.2.3');
    expect(run.store.getState().reminderError).toBeTruthy();
    expect(run.store.getState().skippedVersions).toEqual([]);
    expect(run.store.getState().phase).toBe('available');
    expect(run.store.getState().error).toBeNull();
    expect(run.store.getState().candidate).toBe(run.candidate as Update);
    reminders.write = write;
    expect(run.store.getState().skipVersion('1.2.3')).toBe(true);
    expect(run.store.getState().reminderVersion).toBeNull();
    expect(run.store.getState().reminderError).toBeNull();
    expect(reminders.read()).toEqual(['1.2.3']);
  });

  test('unavailable reminder storage does not block checking or downloading', async () => {
    const reminders = createUpdateReminderStorage(() => {
      throw new Error('storage unavailable');
    });
    const run = setup(reminders);
    await run.store.getState().initialize();
    expect(run.store.getState().phase).toBe('available');
    expect(run.store.getState().reminderVersion).toBe('1.2.3');
    expect(run.store.getState().skipVersion('1.2.3')).toBe(false);
    run.store.getState().dismissReminder('1.2.3');
    expect(run.store.getState().reminderVersion).toBeNull();
    expect(run.store.getState().reminderError).toBeNull();
    await run.store.getState().download();
    expect(run.store.getState().phase).toBe('ready');
  });

  test('no update, check errors and unsupported environments do not open reminders', async () => {
    const run = setup();
    await run.store.getState().initialize();
    run.service.check = async () => {
      throw new Error('request timeout');
    };
    await run.store.getState().check({ notify: true });
    expect(run.store.getState().phase).toBe('error');
    expect(run.store.getState().reminderVersion).toBeNull();
    expect(run.store.getState().skipVersion('1.2.3')).toBe(false);
    run.service.check = async () => null;
    await run.store.getState().check({ notify: true });
    expect(run.store.getState().phase).toBe('current');
    expect(run.store.getState().reminderVersion).toBeNull();

    const unsupported = setup();
    unsupported.service.status = async () => ({
      supported: false,
      configured: true,
      version: '1.2.2',
      platform: 'ios',
    });
    unsupported.service.check = async () => {
      throw new Error('must not check');
    };
    await unsupported.store.getState().initialize();
    expect(unsupported.store.getState().phase).toBe('idle');
    expect(unsupported.store.getState().reminderVersion).toBeNull();
  });
});
