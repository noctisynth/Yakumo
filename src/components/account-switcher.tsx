import { UsersRound } from 'lucide-react';
import { Link } from 'react-router';
import { useAccounts } from '@/hooks/use-accounts';
import { nativeAccountsAvailable } from '@/services/account-service';

export function AccountSwitcher() {
  const { accounts, activeId, pending, switchAccount } = useAccounts();

  return (
    <div className='flex min-w-0 items-center gap-2'>
      <UsersRound
        className='size-4 shrink-0 text-muted-foreground'
        aria-hidden='true'
      />
      {accounts.length ? (
        <>
          <label className='sr-only' htmlFor='current-account'>
            当前账号
          </label>
          <select
            id='current-account'
            value={activeId ?? ''}
            disabled={pending}
            onChange={(event) => {
              void switchAccount(event.target.value);
            }}
            className='h-9 w-32 min-w-0 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:w-44'
          >
            <option value='' disabled>
              选择当前账号
            </option>
            {accounts.map((account) => (
              <option
                key={account.id}
                value={account.id}
                disabled={account.expired}
              >
                {account.username}
                {account.expired ? ' · 已过期' : ''}
              </option>
            ))}
          </select>
          <Link
            to='/accounts'
            className='shrink-0 text-xs text-primary underline-offset-4 hover:underline'
          >
            管理
          </Link>
        </>
      ) : (
        <Link
          to='/accounts'
          className='text-sm text-primary underline-offset-4 hover:underline'
        >
          {nativeAccountsAvailable ? '添加账号' : '账号管理'}
        </Link>
      )}
    </div>
  );
}
