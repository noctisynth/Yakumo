import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';

import { AppLayout } from '@/components/app-layout';
import { AccountsPage } from '@/pages/accounts-page';
import { HomePage } from '@/pages/home-page';
import { LoginPage } from '@/pages/login-page';
import { MePage } from '@/pages/me-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { ProfilePage } from '@/pages/profile-page';
import { RecordDetailPage } from '@/pages/record-detail-page';
import { RecordsPage } from '@/pages/records-page';
import { SchoolPage } from '@/pages/school-page';
import { SettingsPage } from '@/pages/settings-page';

const StudioPage = lazy(() =>
  import('@/pages/studio-page').then((m) => ({ default: m.StudioPage })),
);
const StudioPresetsPage = lazy(() =>
  import('@/pages/studio-presets-page').then((m) => ({
    default: m.StudioPresetsPage,
  })),
);

function LegacyLoginRedirect() {
  const location = useLocation();
  return <Navigate to={`/accounts/login${location.search}`} replace />;
}

export function AppRoutes() {
  return (
    <Suspense
      fallback={
        <p role='status' className='p-8 text-sm text-muted-foreground'>
          正在打开页面…
        </p>
      }
    >
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path='me' element={<MePage />} />
          <Route path='studio'>
            <Route index element={<StudioPage />} />
            <Route path='presets' element={<StudioPresetsPage />} />
          </Route>
          <Route path='profile' element={<ProfilePage />} />
          <Route path='login' element={<LegacyLoginRedirect />} />
          <Route path='accounts'>
            <Route index element={<AccountsPage />} />
            <Route path='login' element={<LoginPage />} />
          </Route>
          <Route path='records' element={<RecordsPage />} />
          <Route path='school' element={<SchoolPage />} />
          <Route path='records/:recordId' element={<RecordDetailPage />} />
          <Route path='settings' element={<SettingsPage />} />
          <Route path='*' element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
