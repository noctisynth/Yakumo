import {
  Check,
  LoaderCircle,
  LogIn,
  Plus,
  ShieldCheck,
  Trash2,
  UsersRound,
} from 'lucide-react';
import type { FormEvent } from 'react';
import { useId, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAccounts } from '@/hooks/use-accounts';
import { nativeAccountsAvailable } from '@/services/account-service';

export function AccountsPage() {
  const {
    accounts,
    activeId,
    pending,
    initialized,
    error,
    login,
    load,
    switchAccount,
    remove,
    clearError,
  } = useAccounts();
  const [username, setUsername] = useState('');
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const formId = useId();
  const unavailable = !nativeAccountsAvailable;
  const disabled = unavailable || pending || !initialized;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || !consent || !passwordRef.current) return;
    const password = passwordRef.current.value;
    passwordRef.current.value = '';
    setNotice(null);
    setConsent(false);
    const success = await login({
      school: 'swpu',
      username,
      password,
      allowInsecureTransport: consent,
    });
    if (success) {
      setUsername('');
      setNotice('登录成功，已设为当前账号。');
    }
  }

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
        <Badge variant='outline' className='gap-2 rounded-full px-3 py-1.5'>
          <UsersRound className='size-3.5' aria-hidden='true' />
          {accounts.length} / 20 个账号
        </Badge>
      </section>

      {unavailable && (
        <p
          role='status'
          className='rounded-xl border border-border bg-muted/50 p-4 text-sm'
        >
          请在桌面应用中登录。浏览器预览不读取或保存账号会话。
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

      <div className='grid items-start gap-6 xl:grid-cols-[1.1fr_1fr]'>
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
                登录后可保留多个会话，随时选择当前账号。
              </p>
            </div>
          ) : (
            <ul className='space-y-3'>
              {accounts.map((account) => (
                <li
                  key={account.id}
                  className='space-y-4 rounded-2xl border border-border/70 bg-card p-5'
                >
                  <div className='flex flex-wrap items-start justify-between gap-3'>
                    <div className='min-w-0 flex-1'>
                      <p className='break-all text-base font-medium'>
                        {account.username}
                      </p>
                      <p className='mt-1 text-xs text-muted-foreground'>
                        {account.schoolName}
                      </p>
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
                      : `会话有效至 ${new Date(account.expiresAt * 1000).toLocaleString('zh-CN')}`}
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
                        setUsername(account.username);
                        setConsent(false);
                        if (passwordRef.current) passwordRef.current.value = '';
                        clearError();
                        setNotice(null);
                        usernameRef.current?.focus();
                      }}
                    >
                      重新登录
                    </Button>
                    <Button
                      variant='ghost'
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
                        移除此账号的本地会话？学校服务端的登录状态不会因此撤销。
                      </p>
                      <div className='flex gap-2'>
                        <Button
                          variant='destructive'
                          disabled={disabled}
                          onClick={async () => {
                            setNotice(null);
                            if (await remove(account.id)) {
                              setConfirmId(null);
                              setNotice('已移除本地账号会话。');
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

        <Card className='rounded-2xl border-border/70 shadow-none'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-lg'>
              <Plus className='size-4' aria-hidden='true' />
              添加或重新登录
            </CardTitle>
            <CardDescription className='leading-6'>
              同一学校的同一账号会更新会话，不会重复添加。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className='space-y-5' aria-busy={pending}>
              <div className='space-y-2'>
                <Label htmlFor={`${formId}-school`}>学校</Label>
                <select
                  id={`${formId}-school`}
                  disabled={disabled}
                  className='h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'
                >
                  <option value='swpu'>西南石油大学</option>
                </select>
                <p className='text-xs leading-5 text-muted-foreground'>
                  目前仅此学校的协议有验证依据。
                </p>
              </div>
              <div className='space-y-2'>
                <Label htmlFor={`${formId}-username`}>账号</Label>
                <Input
                  ref={usernameRef}
                  id={`${formId}-username`}
                  name='username'
                  autoComplete='username'
                  required
                  maxLength={128}
                  value={username}
                  disabled={disabled}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder='请输入学校账号'
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor={`${formId}-password`}>密码</Label>
                <Input
                  ref={passwordRef}
                  id={`${formId}-password`}
                  name='password'
                  type='password'
                  autoComplete='current-password'
                  required
                  maxLength={512}
                  disabled={disabled}
                  placeholder='请输入密码'
                />
              </div>
              <div className='rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-xs leading-6'>
                <p id={`${formId}-transport`}>
                  学校已验证入口使用 HTTP。密码经 RSA
                  加密，但连接无法验证服务端身份，会话令牌仍可能被窃听。请仅在可信网络登录。
                </p>
                <label className='mt-3 flex cursor-pointer items-start gap-2'>
                  <input
                    type='checkbox'
                    className='mt-1 size-4 shrink-0 accent-primary'
                    checked={consent}
                    disabled={disabled}
                    onChange={(event) => setConsent(event.target.checked)}
                    aria-describedby={`${formId}-transport`}
                    required
                  />
                  <span>我了解上述风险，允许本次连接学校服务。</span>
                </label>
              </div>
              <Button
                type='submit'
                disabled={disabled || !consent}
                className='h-10 w-full gap-2'
              >
                {pending ? (
                  <LoaderCircle
                    className='size-4 animate-spin'
                    aria-hidden='true'
                  />
                ) : (
                  <LogIn className='size-4' aria-hidden='true' />
                )}
                {pending ? '正在处理…' : '登录并设为当前账号'}
              </Button>
              <p className='flex items-start gap-2 text-xs leading-6 text-muted-foreground'>
                <ShieldCheck
                  className='mt-1 size-4 shrink-0'
                  aria-hidden='true'
                />
                不保存密码。会话在本机加密保存，密钥由系统密钥库管理。切换账号不会开始或提交运动。
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
