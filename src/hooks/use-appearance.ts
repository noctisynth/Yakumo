import { useEffect } from 'react';

import { usePreferencesStore } from '@/stores/preferences-store';

export function useAppearance() {
  const theme = usePreferencesStore((state) => state.theme);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      document.documentElement.classList.toggle(
        'dark',
        theme === 'dark' || (theme === 'system' && media.matches),
      );
    };

    applyTheme();
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [theme]);
}
