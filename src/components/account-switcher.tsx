import {
  Check,
  ChevronsUpDown,
  LoaderCircle,
  Plus,
  Settings2,
  UserRound,
} from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { Link } from 'react-router';
import { useAccounts } from '@/hooks/use-accounts';
import { cn } from '@/lib/utils';
import { nativeAccountsAvailable } from '@/services/account-service';

function AccountAvatar({
  username,
  className,
}: {
  username?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden='true'
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary',
        className,
      )}
    >
      {username ? (
        Array.from(username)[0]?.toLocaleUpperCase()
      ) : (
        <UserRound className='size-4' />
      )}
    </span>
  );
}

const itemClassName =
  'flex cursor-default items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-45';

export function AccountSwitcher() {
  const { accounts, activeId, pending, initialized, error, switchAccount } =
    useAccounts();
  const active = accounts.find((account) => account.id === activeId);
  const status = !nativeAccountsAvailable
    ? '浏览器预览'
    : pending
      ? '正在处理…'
      : error && !initialized
        ? '账号读取失败'
        : active?.expired
          ? '登录已过期'
          : (active?.schoolName ?? '添加你的学校账号');

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type='button'
          aria-label={`当前账号：${active?.username ?? '未登录'}，打开账号菜单`}
          disabled={pending}
          className='flex w-full min-w-0 items-center gap-3 rounded-2xl border border-border/70 bg-card p-3 text-left transition-colors outline-none hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent disabled:opacity-60'
        >
          <AccountAvatar username={active?.username} />
          <span className='min-w-0 flex-1'>
            <span className='block truncate text-sm font-medium'>
              {active?.username ?? '未登录账号'}
            </span>
            <span
              className={cn(
                'mt-1 block truncate text-[11px]',
                active?.expired ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {status}
            </span>
          </span>
          {pending ? (
            <LoaderCircle
              className='size-4 shrink-0 animate-spin text-muted-foreground'
              aria-hidden='true'
            />
          ) : (
            <ChevronsUpDown
              className='size-4 shrink-0 text-muted-foreground'
              aria-hidden='true'
            />
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side='top'
          align='start'
          sideOffset={8}
          collisionPadding={12}
          className='z-50 max-h-[min(28rem,var(--radix-dropdown-menu-content-available-height))] w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg outline-none'
        >
          <DropdownMenu.Label className='px-3 py-2 text-[11px] font-medium text-muted-foreground'>
            切换账号 · {accounts.length} 个已保存
          </DropdownMenu.Label>
          {accounts.length ? (
            accounts.map((account) => (
              <DropdownMenu.Item
                key={account.id}
                disabled={pending || account.expired}
                onSelect={() => {
                  if (account.id !== activeId) void switchAccount(account.id);
                }}
                className={itemClassName}
                aria-label={`切换到 ${account.username}${account.expired ? '，登录已过期' : ''}`}
              >
                <AccountAvatar
                  username={account.username}
                  className='size-8 rounded-lg text-xs'
                />
                <span className='min-w-0 flex-1'>
                  <span className='block truncate font-medium'>
                    {account.username}
                  </span>
                  <span className='mt-0.5 block truncate text-[11px] text-muted-foreground'>
                    {account.expired
                      ? '登录已过期，请重新登录'
                      : account.schoolName}
                  </span>
                </span>
                {account.id === activeId && (
                  <Check
                    className='size-4 shrink-0 text-primary'
                    aria-label='当前账号'
                  />
                )}
              </DropdownMenu.Item>
            ))
          ) : (
            <p className='px-3 py-4 text-xs leading-6 text-muted-foreground'>
              {error
                ? '暂时无法读取账号，请到账号管理重试。'
                : '添加账号后，即可在这里快速切换。'}
            </p>
          )}
          <DropdownMenu.Separator className='my-1 h-px bg-border' />
          <DropdownMenu.Item asChild className={itemClassName}>
            <Link to='/accounts'>
              <Plus className='size-4' aria-hidden='true' />
              添加账号
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild className={itemClassName}>
            <Link to='/accounts'>
              <Settings2 className='size-4' aria-hidden='true' />
              管理账号
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
