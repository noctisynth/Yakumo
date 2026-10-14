import {
  ArrowLeft,
  ArrowUpRight,
  Eye,
  EyeOff,
  Footprints,
  LoaderCircle,
  LogIn,
  ShieldCheck,
} from 'lucide-react';
import type { FormEvent } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAccounts } from '@/hooks/use-accounts';
import { nativeAccountsAvailable } from '@/services/account-service';
import { useAccountsStore } from '@/stores/accounts-store';

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { accounts, initialized, pending, error, login, load, clearError } =
    useAccounts();
  const reloginAccount = accounts.find(
    (account) => account.id === params.get('account'),
  );
  const [username, setUsername] = useState('');
  const [edited, setEdited] = useState(false);
  const [consent, setConsent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const formId = useId();
  const unavailable = !nativeAccountsAvailable;
  const disabled = unavailable || pending || !initialized;
  const accountName = edited
    ? username
    : (reloginAccount?.username ?? username);

  useEffect(() => {
    const input = passwordRef.current;
    return () => {
      if (input) input.value = '';
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || !consent || !passwordRef.current) return;
    const password = passwordRef.current.value;
    setShowPassword(false);
    setLoginError(null);
    const success = await login({
      school: 'swpu',
      username: accountName,
      password,
      allowInsecureTransport: consent,
    });
    if (success) {
      if (passwordRef.current) passwordRef.current.value = '';
      navigate('/', { replace: true });
    } else {
      setLoginError(
        useAccountsStore.getState().error?.message ?? '登录未完成，请重试。',
      );
      clearError();
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  }

  return (
    <div className='space-y-7 lg:space-y-9'>
      <Link
        to='/accounts'
        className={buttonVariants({
          variant: 'ghost',
          className: '-ml-3 gap-2 text-muted-foreground',
        })}
      >
        <ArrowLeft className='size-4' aria-hidden='true' />
        返回账号管理
      </Link>
      <section>
        <p className='text-[10px] tracking-[0.25em] text-muted-foreground'>
          ACCOUNT / CONNECT
        </p>
        <h1 className='mt-3 text-3xl font-semibold tracking-tight lg:text-4xl'>
          {reloginAccount ? '更新账号会话' : '连接你的学校账号'}
        </h1>
        <p className='mt-3 text-sm leading-6 text-muted-foreground'>
          登录后，查看属于你的运动进度与记录。
        </p>
      </section>
      {unavailable && (
        <p role='status' className='rounded-xl border bg-muted/50 p-4 text-sm'>
          请在应用中登录。浏览器预览不读取或保存账号会话。
        </p>
      )}
      {error && !initialized && (
        <div
          role='alert'
          className='space-y-3 rounded-xl border border-destructive/30 p-4 text-sm text-destructive'
        >
          <p>{error.message}</p>
          <Button
            variant='outline'
            disabled={pending || unavailable}
            onClick={() => void load()}
          >
            重新读取账号
          </Button>
        </div>
      )}
      <div className='grid overflow-hidden rounded-xl border border-border lg:grid-cols-[0.85fr_1.15fr]'>
        <section
          aria-label='欢迎来到八云爱'
          className='relative isolate flex flex-col overflow-hidden bg-[#242943] p-6 text-[#f7f2e8] sm:p-8 xl:p-10'
        >
          <span
            aria-hidden='true'
            className='pointer-events-none absolute -right-5 -bottom-6 -z-10 text-[150px] leading-none font-semibold tracking-tighter text-white/[0.035]'
          >
            PACE
          </span>
          <div className='flex items-center justify-between gap-4'>
            <div className='flex items-center gap-3'>
              <img
                src='/brand/yakumo-mark.png'
                alt=''
                className='size-11 rounded-xl ring-1 ring-white/15'
              />
              <span className='text-xs tracking-[0.25em]'>YAKUMO</span>
            </div>
            <span className='text-[9px] tracking-[0.15em] text-[#e8c784]'>
              YOUR OWN PACE
            </span>
          </div>
          <div className='my-6 sm:my-8 xl:my-16'>
            <span className='mb-5 block h-px w-8 bg-[#e8c784]' />
            <h2 className='text-2xl leading-snug font-semibold tracking-tight sm:text-4xl'>
              把时间，
              <br />
              还给自己。
            </h2>
            <p className='mt-5 hidden max-w-xs text-sm leading-7 text-white/60 sm:block'>
              连接你的学校账号，让运动进度、每次记录与下一步安排，都清楚地呈现在眼前。
            </p>
          </div>
          <div className='mt-auto hidden gap-4 border-t border-white/15 pt-5 text-xs text-white/65 lg:grid'>
            <p className='flex items-center gap-3'>
              <Footprints
                className='size-4 text-[#e8c784]'
                aria-hidden='true'
              />
              进度与记录，回到同一个空间
            </p>
            <p className='flex items-center gap-3'>
              <ShieldCheck
                className='size-4 text-[#e8c784]'
                aria-hidden='true'
              />
              多账号独立保存，随时切换
            </p>
          </div>
        </section>
        <Card className='gap-6 rounded-none border-0 bg-card py-6 shadow-none sm:py-8 xl:py-10'>
          <CardHeader className='px-6 sm:px-8 xl:px-10'>
            <CardTitle className='flex items-center gap-2 text-lg'>
              <LogIn className='size-4' aria-hidden='true' />
              {reloginAccount ? '重新登录' : '添加学校账号'}
            </CardTitle>
            <CardDescription className='leading-6'>
              同一学校的同一账号会更新会话，不会重复添加。
            </CardDescription>
          </CardHeader>
          <CardContent className='px-6 sm:px-8 xl:px-10'>
            <form onSubmit={submit} className='space-y-5' aria-busy={pending}>
              <div className='space-y-2'>
                <Label htmlFor={`${formId}-school`}>学校</Label>
                <select
                  id={`${formId}-school`}
                  disabled={disabled}
                  className='h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'
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
                  className='h-11 text-foreground'
                  ref={usernameRef}
                  id={`${formId}-username`}
                  name='username'
                  autoComplete='username'
                  required
                  maxLength={128}
                  value={accountName}
                  disabled={disabled}
                  onChange={(event) => {
                    setEdited(true);
                    setUsername(event.target.value);
                  }}
                  placeholder='请输入学校账号'
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor={`${formId}-password`}>密码</Label>
                <div className='relative'>
                  <Input
                    className='h-11 pr-12 text-foreground [color-scheme:light] dark:[color-scheme:dark] [&::-ms-reveal]:hidden [&::-ms-clear]:hidden'
                    ref={passwordRef}
                    id={`${formId}-password`}
                    name='password'
                    type={showPassword ? 'text' : 'password'}
                    autoComplete='current-password'
                    required
                    maxLength={512}
                    disabled={disabled}
                    placeholder='请输入密码'
                  />
                  <button
                    type='button'
                    disabled={disabled}
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    aria-pressed={showPassword}
                    aria-controls={`${formId}-password`}
                    onClick={() => setShowPassword((visible) => !visible)}
                    className='absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'
                  >
                    {showPassword ? (
                      <EyeOff className='size-4' aria-hidden='true' />
                    ) : (
                      <Eye className='size-4' aria-hidden='true' />
                    )}
                  </button>
                </div>
              </div>
              <div className='rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-xs leading-6'>
                <p id={`${formId}-transport`}>
                  学校已验证入口使用 HTTP。密码经 RSA
                  加密，但连接无法验证服务端身份，会话令牌仍可能被窃听。请仅在可信网络登录。
                </p>
                <label
                  htmlFor={`${formId}-consent`}
                  className='mt-3 flex cursor-pointer items-start gap-2'
                >
                  <Checkbox
                    id={`${formId}-consent`}
                    className='mt-1'
                    checked={consent}
                    disabled={disabled}
                    onCheckedChange={(checked) => setConsent(checked === true)}
                    aria-describedby={`${formId}-transport`}
                    required
                  />
                  <span>我了解上述风险，允许本次连接学校服务。</span>
                </label>
              </div>
              {loginError && (
                <div
                  ref={errorRef}
                  tabIndex={-1}
                  role='alert'
                  className='rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm leading-6 text-destructive outline-none focus-visible:ring-2 focus-visible:ring-ring'
                >
                  <p className='font-medium'>登录未完成</p>
                  <p className='mt-1'>{loginError}</p>
                </div>
              )}
              <Button
                type='submit'
                disabled={disabled || !consent}
                className='h-11 w-full gap-2'
              >
                {pending ? (
                  <LoaderCircle
                    className='size-4 animate-spin'
                    aria-hidden='true'
                  />
                ) : (
                  <ArrowUpRight className='size-4' aria-hidden='true' />
                )}
                {pending ? '正在登录…' : '登录并进入数据大盘'}
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
