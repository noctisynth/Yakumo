import { useEffect, useRef } from 'react';
import { AccountRequired } from '@/components/account-required';
import { RecordsPanel } from '@/components/records-panel';
import { useDashboardAccount } from '@/hooks/use-dashboard-account';
import { useDashboardStore } from '@/stores/dashboard-store';

export function RecordsPage() {
  const { active, ready } = useDashboardAccount();
  const loaded = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !active) {
      loaded.current = null;
      return;
    }
    if (loaded.current === active.id) return;
    loaded.current = active.id;
    const state = useDashboardStore.getState();
    void state.recordsPage(state.filter);
  }, [ready, active]);
  if (!ready) return <AccountRequired />;
  return (
    <div className='space-y-7'>
      <div>
        <p className='text-[10px] tracking-[0.25em] text-muted-foreground'>
          ACTIVITY / 02
        </p>
        <h1 className='mt-3 text-3xl font-semibold tracking-tight'>
          每一步，都有迹可循。
        </h1>
        <p className='mt-3 text-sm text-muted-foreground'>
          查看学校记录，按状态和日期筛选，了解每次运动的结果。
        </p>
      </div>
      <RecordsPanel />
    </div>
  );
}
