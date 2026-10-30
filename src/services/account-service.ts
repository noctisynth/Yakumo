import { invoke, isTauri } from '@tauri-apps/api/core';
import type { AccountSnapshot, LoginInput } from '@/models/account';

export const nativeAccountsAvailable = isTauri();

async function accountCommand(
  command: string,
  args?: Record<string, unknown>,
): Promise<AccountSnapshot> {
  if (!nativeAccountsAvailable) {
    throw {
      code: 'native_required',
      message: '请打开八云爱应用管理账号。',
    };
  }
  return invoke<AccountSnapshot>(command, args);
}

export const accountService = {
  refreshIdentity: (accountId: string) =>
    accountCommand('refresh_account_identity', { accountId }),
  updateAvatar: (accountId: string, dataUri: string) =>
    accountCommand('update_account_avatar', { accountId, dataUri }),
  list: () => accountCommand('list_accounts'),
  login: (input: LoginInput) => accountCommand('login_account', { input }),
  switch: (id: string) => accountCommand('switch_account', { id }),
  remove: (id: string) => accountCommand('remove_account', { id }),
};
