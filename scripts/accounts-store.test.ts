import { describe, expect, test } from 'bun:test';
import type { AccountSnapshot } from '@/models/account';
import { createAccountsStore } from '@/stores/accounts-store';

const first: AccountSnapshot = {
  activeId: 'synthetic-a',
  accounts: [
    {
      id: 'synthetic-a',
      school: 'swpu',
      schoolName: '合成学校',
      username: '合成账号',
      expiresAt: 3600,
      expired: false,
    },
  ],
};

describe('accounts state', () => {
  test('serializes operations and preserves the account snapshot on failure', async () => {
    let complete: (snapshot: AccountSnapshot) => void = () => {};
    let mutations = 0;
    const state = createAccountsStore({
      refreshIdentity: async () => ({ accounts: [], activeId: null }),
      updateAvatar: async () => ({ accounts: [], activeId: null }),
      list: () =>
        new Promise<AccountSnapshot>((resolve) => {
          complete = resolve;
        }),
      login: async () => {
        mutations += 1;
        return first;
      },
      switch: async () => {
        throw { code: 'storage_unavailable', message: '安全存储不可用。' };
      },
      remove: async () => {
        throw new Error('synthetic-secret-must-not-be-displayed');
      },
    });
    const loading = state.getState().load();
    expect(state.getState().pending).toBe(true);
    expect(
      await state.getState().login({
        school: 'swpu',
        username: 'synthetic',
        password: 'synthetic-password',
        allowInsecureTransport: true,
      }),
    ).toBe(false);
    expect(mutations).toBe(0);
    complete(first);
    expect(await loading).toBe(true);
    expect(state.getState().activeId).toBe('synthetic-a');
    expect(await state.getState().switchAccount('synthetic-b')).toBe(false);
    expect(state.getState().activeId).toBe('synthetic-a');
    expect(state.getState().accounts).toEqual(first.accounts);
    expect(state.getState().error?.code).toBe('storage_unavailable');
    expect(await state.getState().remove('synthetic-a')).toBe(false);
    expect(state.getState().error?.message).not.toContain('synthetic-secret');
    expect(state.getState().pending).toBe(false);
    expect(JSON.stringify(state.getState())).not.toContain(
      'synthetic-password',
    );
  });

  test('allows retry after a failed initial load and clears stale selection on removal', async () => {
    let attempts = 0;
    const state = createAccountsStore({
      refreshIdentity: async () => ({ accounts: [], activeId: null }),
      updateAvatar: async () => ({ accounts: [], activeId: null }),
      list: async () => {
        if (++attempts === 1)
          throw { code: 'storage_unavailable', message: '请重试。' };
        return first;
      },
      login: async () => first,
      switch: async () => first,
      remove: async () => ({ accounts: [], activeId: null }),
    });
    expect(await state.getState().load()).toBe(false);
    expect(state.getState().initialized).toBe(false);
    expect(await state.getState().load()).toBe(true);
    expect(state.getState().error).toBeNull();
    expect(await state.getState().remove('synthetic-a')).toBe(true);
    expect(state.getState().activeId).toBeNull();
    expect(state.getState().accounts).toHaveLength(0);
  });
});
