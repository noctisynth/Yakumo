import { useEffect, useState } from 'react';
import { nativeAccountsAvailable } from '@/services/account-service';
import { useAccountsStore } from '@/stores/accounts-store';

export function useAccounts() {
  const state = useAccountsStore();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const current = useAccountsStore.getState();
    if (
      nativeAccountsAvailable &&
      !current.initialized &&
      !current.pending &&
      !current.error
    ) {
      void current.load();
    }
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return {
    ...state,
    accounts: state.accounts.map((account) => ({
      ...account,
      expired: account.expired || account.expiresAt * 1000 <= now,
    })),
  };
}
