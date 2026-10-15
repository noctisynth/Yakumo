import { create } from 'zustand';
import type {
  AccountError,
  AccountSnapshot,
  LoginInput,
} from '@/models/account';
import { accountService } from '@/services/account-service';

interface AccountsState extends AccountSnapshot {
  initialized: boolean;
  pending: boolean;
  error: AccountError | null;
  load: () => Promise<boolean>;
  login: (input: LoginInput) => Promise<boolean>;
  switchAccount: (id: string) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  refreshIdentity: (id: string) => Promise<boolean>;
  updateAvatar: (id: string, dataUri: string) => Promise<boolean>;
  clearError: () => void;
}

function safeError(error: unknown): AccountError {
  // Only display the native contract; never stringify transport errors or inputs.
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    typeof error.code === 'string' &&
    typeof error.message === 'string'
  ) {
    return { code: error.code, message: error.message };
  }
  return { code: 'unknown_error', message: '账号操作未能完成，请重试。' };
}

export function createAccountsStore(service = accountService) {
  return create<AccountsState>((set, get) => {
    async function perform(
      action: () => Promise<AccountSnapshot>,
    ): Promise<boolean> {
      if (get().pending) return false;
      set({ pending: true, error: null });
      try {
        const snapshot = await action();
        set({ ...snapshot, initialized: true, pending: false });
        return true;
      } catch (error) {
        set({ error: safeError(error), pending: false });
        return false;
      }
    }

    return {
      accounts: [],
      activeId: null,
      initialized: false,
      pending: false,
      error: null,
      load: () => perform(service.list),
      login: (input) => perform(() => service.login(input)),
      switchAccount: (id) => perform(() => service.switch(id)),
      remove: (id) => perform(() => service.remove(id)),
      refreshIdentity: (id) => perform(() => service.refreshIdentity(id)),
      updateAvatar: (id, dataUri) =>
        perform(() => service.updateAvatar(id, dataUri)),
      clearError: () => set({ error: null }),
    };
  });
}

export const useAccountsStore = createAccountsStore();
