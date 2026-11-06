import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater';
import { create } from 'zustand';
import { updateReminderStorage } from '@/services/update-reminder-storage';
import {
  type UpdateStatus,
  updateError,
  updateService,
} from '@/services/update-service';

type Phase =
  | 'idle'
  | 'checking'
  | 'current'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'installing'
  | 'installed'
  | 'error'
  | 'cancelled';
interface UpdateState {
  status: UpdateStatus | null;
  phase: Phase;
  candidate: Update | null;
  transferred: number;
  error: string | null;
  skippedVersions: string[];
  reminderVersion: string | null;
  reminderError: string | null;
  initialize: () => Promise<void>;
  check: (options?: { notify?: boolean }) => Promise<void>;
  dismissReminder: (version: string) => void;
  skipVersion: (version: string) => boolean;
  download: () => Promise<void>;
  cancel: () => Promise<void>;
  install: () => Promise<void>;
  restart: () => Promise<void>;
}

export function createUpdateStore(
  service = updateService,
  reminders = updateReminderStorage,
) {
  let initialized = false;
  let cancelling = false;
  const dismissedVersions = new Set<string>();
  return create<UpdateState>((set, get) => ({
    status: null,
    phase: 'idle',
    candidate: null,
    transferred: 0,
    error: null,
    skippedVersions: [],
    reminderVersion: null,
    reminderError: null,
    initialize: async () => {
      if (initialized) return;
      initialized = true;
      set({ skippedVersions: reminders.read() });
      try {
        const status = await service.status();
        set({ status });
        if (status.supported && status.configured)
          await get().check({ notify: true });
      } catch {
        set({ phase: 'error', error: '无法读取更新配置，请重启应用后重试。' });
      }
    },
    check: async (options) => {
      if (
        ['checking', 'downloading', 'installing', 'installed'].includes(
          get().phase,
        )
      )
        return;
      const previous = get().candidate;
      set({
        phase: 'checking',
        candidate: null,
        transferred: 0,
        error: null,
        reminderVersion: null,
        reminderError: null,
      });
      try {
        await previous?.close();
        const candidate = await service.check();
        set({
          candidate,
          phase: candidate ? 'available' : 'current',
          reminderVersion:
            options?.notify &&
            candidate &&
            !get().skippedVersions.includes(candidate.version) &&
            !dismissedVersions.has(candidate.version)
              ? candidate.version
              : null,
        });
      } catch (error) {
        set({ phase: 'error', error: updateError(error) });
      }
    },
    dismissReminder: (version) => {
      const state = get();
      if (
        state.phase !== 'available' ||
        state.candidate?.version !== version ||
        state.reminderVersion !== version
      )
        return;
      dismissedVersions.add(version);
      set({ reminderVersion: null, reminderError: null });
    },
    skipVersion: (version) => {
      const state = get();
      if (
        state.phase !== 'available' ||
        state.candidate?.version !== version ||
        state.reminderVersion !== version
      )
        return false;
      const skippedVersions = [...new Set([...state.skippedVersions, version])];
      try {
        reminders.write(skippedVersions);
      } catch {
        set({
          reminderError: '无法保存跳过记录。请重试，或选择“稍后”关闭本次提醒。',
        });
        return false;
      }
      dismissedVersions.add(version);
      set({ skippedVersions, reminderVersion: null, reminderError: null });
      return true;
    },
    download: async () => {
      const candidate = get().candidate;
      if (!candidate || get().phase !== 'available') return;
      cancelling = false;
      dismissedVersions.add(candidate.version);
      set({
        phase: 'downloading',
        transferred: 0,
        error: null,
        reminderVersion: null,
        reminderError: null,
      });
      try {
        await candidate.download(
          (event: DownloadEvent) => {
            if (event.event === 'Progress')
              set((state) => ({
                transferred: state.transferred + event.data.chunkLength,
              }));
          },
          { timeout: 600_000, retryOnVerificationFailure: false },
        );
        if (cancelling) {
          await candidate.close();
          set({ phase: 'cancelled', candidate: null });
        } else set({ phase: 'ready' });
      } catch (error) {
        await candidate.close().catch(() => {});
        set({
          phase: cancelling ? 'cancelled' : 'error',
          candidate: null,
          error: cancelling ? null : updateError(error),
        });
      }
    },
    cancel: async () => {
      if (get().phase !== 'downloading' || cancelling) return;
      cancelling = true;
      try {
        await get().candidate?.cancel();
      } catch (error) {
        cancelling = false;
        set({ error: updateError(error) });
      }
    },
    install: async () => {
      const candidate = get().candidate;
      if (!candidate || get().phase !== 'ready') return;
      set({ phase: 'installing', error: null });
      try {
        await candidate.install({ restartAfterInstall: true });
        set({ phase: 'installed', candidate: null });
        await candidate.close().catch(() => {});
      } catch (error) {
        set({ phase: 'ready', error: updateError(error, true) });
      }
    },
    restart: async () => {
      try {
        await service.restart();
      } catch {
        set({ error: '无法自动重启，请关闭并重新打开应用确认版本。' });
      }
    },
  }));
}

export const useUpdateStore = createUpdateStore();
