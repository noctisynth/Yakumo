import { Check, Plus, Trash2, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AccountAvatar } from '@/components/account-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAccounts } from '@/hooks/use-accounts';
import { nativeAccountsAvailable } from '@/services/account-service';

export function AccountsPage() {
  const navigate = useNavigate();
  const {
    accounts,
    activeId,
    pending,
    initialized,
    error,
    load,
    switchAccount,
    remove,
  } = useAccounts();
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const unavailable = !nativeAccountsAvailable;
  const disabled = unavailable || pending || !initialized;

  return (
    <div className='space-y-8'>
      <section className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <p className='mb-3 text-[10px] font-medium tracking-[0.2em] text-primary uppercase'>
            your accounts
          </p>
          <h1 className='text-3xl font-semibold tracking-tight'>账号管理</h1>
          <p className='mt-3 text-sm leading-6 text-muted-foreground'>
            在多个账号之间切换，清楚掌握当前使用的身份。
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-3'>
          <Button asChild>
            <Link to='/accounts/login'>
              <Plus className='size-4' aria-hidden='true' />
              添加账号
            </Link>
          </Button>
          <Badge variant='outline' className='gap-2 rounded-full px-3 py-1.5'>
            <UsersRound className='size-3.5' aria-hidden='true' />
            {accounts.length} / 20 个账号
          </Badge>
        </div>
      </section>

      {unavailable && (
        <p
          role='status'
          className='rounded-xl border border-border bg-muted/50 p-4 text-sm'
        >
          请打开八云爱应用登录。
        </p>
      )}
      {error && (
        <div
          role='alert'
          className='flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive'
        >
          <span>{error.message}</span>
          <Button
            variant='outline'
            disabled={pending || unavailable}
            onClick={() => {
              void load();
            }}
          >
            重新读取账号
          </Button>
        </div>
      )}
      <div className='sr-only' role='status' aria-live='polite'>
        {pending ? '正在处理账号操作…' : null}
      </div>
      {notice && (
        <p
          role='status'
          className='rounded-xl bg-accent p-4 text-sm text-accent-foreground'
        >
          {notice}
        </p>
      )}

      <div className='mx-auto w-full max-w-4xl'>
        <section aria-labelledby='saved-accounts-title'>
          <div className='mb-4 flex items-center justify-between gap-3'>
            <h2 id='saved-accounts-title' className='text-lg font-medium'>
              已保存的账号
            </h2>
            <Button
              variant='ghost'
              disabled={pending || unavailable}
              onClick={() => {
                void load();
              }}
            >
              刷新列表
            </Button>
          </div>
          {accounts.length === 0 ? (
            <div className='rounded-2xl border border-dashed border-border px-6 py-12 text-center'>
              <UsersRound
                className='mx-auto mb-4 size-8 text-muted-foreground/60'
                aria-hidden='true'
              />
              <p className='text-sm font-medium'>
                {pending
                  ? '正在读取账号…'
                  : error && !initialized
                    ? '账号列表尚未读取'
                    : '还没有添加账号'}
              </p>
              <p className='mt-2 text-xs leading-6 text-muted-foreground'>
                添加账号后，可随时切换使用。
              </p>
              <Button asChild className='mt-5'>
                <Link to='/accounts/login'>登录第一个账号</Link>
              </Button>
            </div>
          ) : (
            <ul className='space-y-3'>
              {accounts.map((account) => (
                <li
                  key={account.id}
                  className='relative isolate space-y-4 overflow-hidden rounded-2xl border border-border/70 bg-card p-5 sm:p-6'
                >
                  <span
                    aria-hidden='true'
                    className='pointer-events-none absolute -right-2 -bottom-4 -z-10 max-w-full truncate text-5xl leading-none font-semibold tracking-tighter text-foreground/[0.035] sm:text-7xl'
                  >
                    {account.username}
                  </span>
                  <div className='flex flex-wrap items-start justify-between gap-3'>
                    <div className='flex min-w-0 flex-1 items-center gap-4'>
                      <AccountAvatar
                        avatarUrl={account.avatarUrl}
                        className='size-12'
                      />
                      <div className='min-w-0'>
                        <p className='break-all text-base font-medium'>
                          {account.displayName?.trim() || account.username}
                        </p>
                        <p className='mt-1 text-xs text-muted-foreground'>
                          {account.schoolName}
                        </p>
                      </div>
                    </div>
                    <div className='flex flex-wrap gap-2'>
                      {activeId === account.id && (
                        <Badge className='gap-1'>
                          <Check className='size-3' aria-hidden='true' />
                          当前账号
                        </Badge>
                      )}
                      {account.expired && (
                        <Badge variant='destructive'>登录已过期</Badge>
                      )}
                    </div>
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    {account.expired
                      ? '请重新登录以继续使用此账号。'
                      : `登录有效期至 ${new Date(account.expiresAt * 1000).toLocaleString('zh-CN')}`}
                  </p>
                  <div className='flex flex-wrap gap-2'>
                    <Button
                      variant={
                        activeId === account.id ? 'secondary' : 'default'
                      }
                      disabled={
                        disabled || account.expired || activeId === account.id
                      }
                      onClick={async () => {
                        setNotice(null);
                        if (await switchAccount(account.id))
                          setNotice(`已切换到 ${account.username}。`);
                      }}
                    >
                      {activeId === account.id ? '正在使用' : '切换账号'}
                    </Button>
                    <Button
                      variant='outline'
                      disabled={disabled}
                      onClick={() => {
                        navigate(
                          `/accounts/login?account=${encodeURIComponent(account.id)}`,
                        );
                      }}
                    >
                      重新登录
                    </Button>
                    <Button
                      variant='destructive'
                      disabled={disabled}
                      aria-label={`移除账号 ${account.username}`}
                      onClick={() => setConfirmId(account.id)}
                    >
                      <Trash2 className='size-4' aria-hidden='true' />
                      移除
                    </Button>
                  </div>
                  {confirmId === account.id && (
                    <div className='space-y-3 rounded-lg bg-muted p-3'>
                      <p className='text-xs leading-6'>
                        将移除此设备上保存的登录信息和预设，不会退出学校服务。提交记录将保留，重新添加账号后可查看。
                      </p>
                      <div className='flex gap-2'>
                        <Button
                          variant='destructive'
                          disabled={disabled}
                          onClick={async () => {
                            setNotice(null);
                            if (await remove(account.id)) {
                              setConfirmId(null);
                              setNotice('已移除此设备上保存的账号。');
                            }
                          }}
                        >
                          确认移除
                        </Button>
                        <Button
                          variant='outline'
                          disabled={pending}
                          onClick={() => setConfirmId(null)}
                        >
                          取消
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
