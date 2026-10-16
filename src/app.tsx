import { useEffect } from 'react';
import { HashRouter } from 'react-router';
import { useAppearance } from '@/hooks/use-appearance';
import { AppRoutes } from '@/routes/app-routes';
import { useUpdateStore } from '@/stores/update-store';

export function App() {
  useAppearance();
  useEffect(() => {
    void useUpdateStore.getState().initialize();
  }, []);

  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
