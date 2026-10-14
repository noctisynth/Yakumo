import { Route, Routes } from 'react-router';

import { AppLayout } from '@/components/app-layout';
import { AccountsPage } from '@/pages/accounts-page';
import { HomePage } from '@/pages/home-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { ProfilePage } from '@/pages/profile-page';
import { RecordDetailPage } from '@/pages/record-detail-page';
import { RecordsPage } from '@/pages/records-page';
import { SchoolPage } from '@/pages/school-page';
import { SettingsPage } from '@/pages/settings-page';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
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
