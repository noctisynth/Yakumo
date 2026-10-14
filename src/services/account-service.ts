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
      message: '请在桌面应用中管理账号，浏览器预览无法登录。',
    };
  }
  return invoke<AccountSnapshot>(command, args);
}

export const accountService = {
  list: () => accountCommand('list_accounts'),
  login: (input: LoginInput) => accountCommand('login_account', { input }),
  switch: (id: string) => accountCommand('switch_account', { id }),
  remove: (id: string) => accountCommand('remove_account', { id }),
};
