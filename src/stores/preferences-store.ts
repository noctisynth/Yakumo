import { create } from 'zustand';

import type { Preferences, ThemePreference } from '@/models/preferences';

interface PreferencesStore extends Preferences {
  setTheme: (theme: ThemePreference) => void;
  setCompact: (compact: boolean) => void;
  reset: () => void;
}

const defaults: Preferences = { theme: 'system', compact: false };

export const usePreferencesStore = create<PreferencesStore>((set) => ({
  ...defaults,
  setTheme: (theme) => set({ theme }),
  setCompact: (compact) => set({ compact }),
  reset: () => set(defaults),
}));
