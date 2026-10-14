import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import type { RunInput, RunPreview } from '@/models/run';

interface StudioState {
  accountId: string | null;
  preview: RunPreview | null;
  busy: boolean;
  error: string | null;
  activate: (id: string | null) => void;
  generate: (input: RunInput) => Promise<void>;
  clear: () => void;
}
let generation = 0;
export const useStudioStore = create<StudioState>((set, get) => ({
  accountId: null,
  preview: null,
  busy: false,
  error: null,
  activate: (accountId) => {
    if (accountId === get().accountId) return;
    generation++;
    set({ accountId, preview: null, busy: false, error: null });
  },
  clear: () => {
    generation++;
    set({ preview: null, busy: false, error: null });
  },
  generate: async (input) => {
    if (get().busy) return;
    const current = ++generation;
    set({ busy: true, error: null, preview: null });
    try {
      const preview = await invoke<RunPreview>('preview_run', { input });
      if (current === generation) set({ preview, busy: false });
    } catch (e) {
      if (current === generation)
        set({
          busy: false,
          error:
            typeof e === 'object' &&
            e !== null &&
            'message' in e &&
            typeof e.message === 'string'
              ? e.message
              : '生成失败，请检查参数后重试。',
        });
    }
  },
}));
