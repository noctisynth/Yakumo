import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater';
import { create } from 'zustand';
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
  initialize: () => Promise<void>;
  check: () => Promise<void>;
  download: () => Promise<void>;
  cancel: () => Promise<void>;
  install: () => Promise<void>;
  restart: () => Promise<void>;
}

export function createUpdateStore(service = updateService) {
  let initialized = false;
  let cancelling = false;
  return create<UpdateState>((set, get) => ({
    status: null,
    phase: 'idle',
    candidate: null,
    transferred: 0,
    error: null,
    initialize: async () => {
      if (initialized) return;
      initialized = true;
      try {
        const status = await service.status();
        set({ status });
        if (status.supported && status.configured) await get().check();
      } catch {
        set({ phase: 'error', error: '无法读取更新配置，请重启应用后重试。' });
      }
    },
    check: async () => {
      if (
        ['checking', 'downloading', 'installing', 'installed'].includes(
          get().phase,
        )
      )
        return;
      const previous = get().candidate;
      set({ phase: 'checking', candidate: null, transferred: 0, error: null });
      try {
        await previous?.close();
        const candidate = await service.check();
        set({ candidate, phase: candidate ? 'available' : 'current' });
      } catch (error) {
        set({ phase: 'error', error: updateError(error) });
      }
    },
    download: async () => {
      const candidate = get().candidate;
      if (!candidate || get().phase !== 'available') return;
      cancelling = false;
      set({ phase: 'downloading', transferred: 0, error: null });
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
