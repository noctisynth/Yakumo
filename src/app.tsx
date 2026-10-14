import { HashRouter } from 'react-router';

import { useAppearance } from '@/hooks/use-appearance';
import { AppRoutes } from '@/routes/app-routes';

export function App() {
  useAppearance();

  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
