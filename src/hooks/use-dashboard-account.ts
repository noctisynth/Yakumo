import { useEffect } from 'react';
import { useAccounts } from '@/hooks/use-accounts';
import { useDashboardStore } from '@/stores/dashboard-store';

export function useDashboardAccount() {
  const { accounts, activeId, initialized } = useAccounts();
  const active = accounts.find((account) => account.id === activeId);
  const ready = initialized && !!active && !active.expired;
  const boundId = useDashboardStore((state) => state.accountId);
  useEffect(() => {
    useDashboardStore.getState().activate(ready ? activeId : null);
  }, [ready, activeId]);
  return { active, ready: ready && boundId === activeId, initialized };
}
