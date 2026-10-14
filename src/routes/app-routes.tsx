import { Route, Routes } from 'react-router';

import { AppLayout } from '@/components/app-layout';
import { HomePage } from '@/pages/home-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { SettingsPage } from '@/pages/settings-page';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path='settings' element={<SettingsPage />} />
        <Route path='*' element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
