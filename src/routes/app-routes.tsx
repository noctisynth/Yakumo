import { Route, Routes } from 'react-router';

import { AppLayout } from '@/components/app-layout';
import { AccountsPage } from '@/pages/accounts-page';
import { HomePage } from '@/pages/home-page';
import { MePage } from '@/pages/me-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { ProfilePage } from '@/pages/profile-page';
import { RecordDetailPage } from '@/pages/record-detail-page';
import { RecordsPage } from '@/pages/records-page';
import { SchoolPage } from '@/pages/school-page';
import { SettingsPage } from '@/pages/settings-page';
import { StudioPage } from '@/pages/studio-page';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path='me' element={<MePage />} />
        <Route path='studio' element={<StudioPage />} />
        <Route path='profile' element={<ProfilePage />} />
        <Route path='accounts' element={<AccountsPage />} />
        <Route path='records' element={<RecordsPage />} />
        <Route path='school' element={<SchoolPage />} />
        <Route path='records/:recordId' element={<RecordDetailPage />} />
        <Route path='settings' element={<SettingsPage />} />
        <Route path='*' element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
