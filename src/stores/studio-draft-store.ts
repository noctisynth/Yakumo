import { create } from 'zustand';
import type { StudioConfig } from '@/models/studio';
import { useStudioStore } from '@/stores/studio-store';
export const useStudioDraftStore = create<{
  accountId: string | null;
  config: StudioConfig | null;
  activate: (accountId: string | null) => void;
  set: (accountId: string, config: StudioConfig) => void;
}>((set, get) => ({
  accountId: null,
  config: null,
  activate: (accountId) => {
    if (get().accountId !== accountId) set({ accountId, config: null });
  },
  set: (accountId, config) => {
    useStudioStore.getState().clear();
    set({ accountId, config });
  },
}));
