import { invoke, isTauri } from '@tauri-apps/api/core';
import { useEffect } from 'react';
import { usePreferencesStore } from '@/stores/preferences-store';

interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
  keyboard: boolean;
}
export function useAppearance() {
  const theme = usePreferencesStore((state) => state.theme);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    let live = true,
      sequence = 0;
    const sync = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
      if (!isTauri()) return;
      const current = ++sequence;
      void invoke<Insets | null>('sync_mobile_appearance', { dark })
        .then((insets) => {
          if (!live || current !== sequence || !insets) return;
          for (const key of ['top', 'bottom', 'left', 'right'] as const) {
            const value = insets[key];
            if (
              typeof value === 'number' &&
              Number.isFinite(value) &&
              value >= 0 &&
              value <= 200
            )
              document.documentElement.style.setProperty(
                `--native-safe-${key}`,
                `${value}px`,
              );
          }
          if (typeof insets.keyboard === 'boolean')
            document.documentElement.dataset.keyboard = insets.keyboard
              ? 'open'
              : 'closed';
        })
        .catch(() => {
          /* Keep web safe-area fallbacks when native display information is unavailable. */
        });
    };
    sync();
    media.addEventListener('change', sync);
    window.addEventListener('resize', sync);
    window.visualViewport?.addEventListener('resize', sync);
    document.addEventListener('focusin', sync);
    document.addEventListener('focusout', sync);
    return () => {
      live = false;
      media.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
      window.visualViewport?.removeEventListener('resize', sync);
      document.removeEventListener('focusin', sync);
      document.removeEventListener('focusout', sync);
    };
  }, [theme]);
}
