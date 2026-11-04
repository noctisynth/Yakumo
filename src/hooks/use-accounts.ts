import { useEffect } from 'react';
import { nativeAccountsAvailable } from '@/services/account-service';
import { useAccountsStore } from '@/stores/accounts-store';

export function useAccounts() {
  const state = useAccountsStore();

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
  }, []);
  return state;
}
