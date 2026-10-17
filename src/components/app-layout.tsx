import {
  ArrowLeft,
  ArrowUpRight,
  Footprints,
  LayoutDashboard,
  ListFilter,
  Settings2,
  SlidersHorizontal,
  UserRound,
  WandSparkles,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { AccountSwitcher } from '@/components/account-switcher';
import { useDashboardAccount } from '@/hooks/use-dashboard-account';
import { cn } from '@/lib/utils';
import { useAccountsStore } from '@/stores/accounts-store';
import { usePreferencesStore } from '@/stores/preferences-store';
import { useUpdateStore } from '@/stores/update-store';

const navigation = [
  { to: '/', label: '数据大盘', detail: 'Overview', icon: LayoutDashboard },
  { to: '/records', label: '运动记录', detail: 'Activity', icon: Footprints },
  {
    to: '/school',
    label: '学校配置',
    detail: 'School',
    icon: SlidersHorizontal,
  },
  { to: '/studio', label: '生成工作室', detail: 'Studio', icon: WandSparkles },
  {
    to: '/settings',
    label: '偏好设置',
    detail: 'Preferences',
    icon: Settings2,
  },
];

export function AppLayout() {
  const { active } = useDashboardAccount();
  const compact = usePreferencesStore((state) => state.compact);
  const accountError = useAccountsStore((state) => state.error);
  const location = useLocation();
  const updateVersion = useUpdateStore((state) =>
    state.phase === 'available' ? state.candidate?.version : null,
  );
  const parentPage =
    location.pathname === '/studio/presets'
      ? { to: '/studio', label: '生成工作室', title: '预设列表' }
      : location.pathname === '/accounts/login'
        ? { to: '/accounts', label: '账号管理', title: '登录账号' }
        : /^\/records\/[^/]+$/.test(location.pathname)
          ? { to: '/records', label: '运动记录', title: '记录详情' }
          : (
              {
                '/profile': { to: '/me', label: '我的', title: '账号资料' },
                '/accounts': { to: '/me', label: '我的', title: '账号管理' },
              } as Record<string, { to: string; label: string; title: string }>
            )[location.pathname];
  const hasParent = Boolean(parentPage);
  const current = navigation.find((item) =>
    item.to === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(item.to),
  );
  return (
    <div className='flex h-dvh flex-col overflow-hidden bg-background pl-[var(--native-safe-left,env(safe-area-inset-left))] pr-[var(--native-safe-right,env(safe-area-inset-right))] text-foreground'>
      <button
        type='button'
        onClick={() => document.getElementById('main-content')?.focus()}
        className='sr-only z-50 bg-primary p-3 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3'
      >
        跳到主要内容
      </button>
      <div className='mx-auto flex min-h-0 w-full max-w-[1920px] flex-1 flex-col desktop:flex-row'>
        <aside className='z-20 hidden min-h-0 shrink-0 flex-col overscroll-none desktop:flex desktop:overflow-y-auto bg-[#191c35] px-5 py-5 text-[#f4f0e7] desktop:w-60 desktop:px-5 desktop:py-8 lg:w-64'>
          <NavLink
            to='/'
            aria-label='八云爱首页'
            className='flex items-center gap-3 px-1'
          >
            <img
              src='/brand/yakumo-mark.png'
              alt=''
              width='48'
              height='48'
              className='size-12 rounded-xl ring-1 ring-white/15'
            />
            <span>
              <span className='block text-xl font-semibold tracking-[0.08em]'>
                八云爱<span className='ml-1 text-[#e8c784]'>.</span>
              </span>
              <span className='mt-1 block text-[9px] tracking-[0.32em] text-white/45'>
                YAKUMO
              </span>
            </span>
          </NavLink>
          <p className='mt-12 mb-4 hidden px-3 text-[10px] tracking-[0.22em] text-white/30 desktop:block'>
            WORKSPACE
          </p>
          <nav
            aria-label='主导航'
            className='mt-5 grid grid-cols-2 gap-2 desktop:mt-0 desktop:grid-cols-1'
          >
            {navigation.map(({ to, label, detail, icon: Icon }, index) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-3 rounded-lg border px-3 py-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8c784]',
                    isActive
                      ? 'border-white/10 bg-white/10 text-[#f4d99c]'
                      : 'border-transparent text-white/60 hover:bg-white/5 hover:text-white',
                  )
                }
              >
                <Icon className='size-[18px] shrink-0' aria-hidden='true' />
                <span className='flex-1 text-sm'>
                  {label}
                  <span className='mt-0.5 hidden text-[10px] tracking-wide text-white/35 desktop:block'>
                    {detail}
                  </span>
                </span>
                <span className='hidden text-[10px] tabular-nums text-white/25 desktop:block'>
                  0{index + 1}
                </span>
              </NavLink>
            ))}
          </nav>
          <div className='mt-auto hidden px-3 pt-12 pb-6 desktop:block'>
            <div className='mb-4 h-px w-7 bg-[#e8c784]/60' />
            <p className='text-sm leading-7 text-white/75'>
              把时间，还给自己。
            </p>
            <p className='mt-2 text-[10px] leading-5 tracking-wide text-white/35'>
              YOUR PACE. YOUR SPACE.
            </p>
          </div>
          <div className='mt-5 text-foreground desktop:mt-0'>
            <AccountSwitcher />
          </div>
        </aside>
        <div className='min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-none'>
          <header className='flex h-[calc(4rem+var(--native-safe-top,env(safe-area-inset-top)))] items-center pt-[var(--native-safe-top,env(safe-area-inset-top))] desktop:h-16 desktop:pt-0 justify-between gap-3 border-b border-border px-5 desktop:px-9 lg:px-12'>
            {!hasParent && (
              <Link
                to='/'
                aria-label='八云爱首页'
                className='flex items-center gap-2 text-sm font-semibold desktop:hidden'
              >
                <img
                  src='/brand/yakumo-mark.png'
                  alt=''
                  className='size-8 rounded-lg'
                />
                八云爱
              </Link>
            )}
            <nav
              aria-label='页面层级'
              className={cn(
                'items-center gap-2 text-xs text-muted-foreground',
                hasParent ? 'flex' : 'hidden desktop:flex',
              )}
            >
              {parentPage ? (
                <Link
                  to={parentPage.to}
                  aria-label={`返回${parentPage.label}`}
                  className='relative flex size-3.5 shrink-0 items-center justify-center rounded-sm outline-none before:absolute before:-inset-[15px] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'
                >
                  <ArrowLeft className='size-3.5' aria-hidden='true' />
                </Link>
              ) : (
                <ListFilter className='size-3.5' aria-hidden='true' />
              )}
              <span className={hasParent ? 'hidden desktop:inline' : undefined}>
                工作空间
              </span>
              <span
                aria-hidden='true'
                className={cn(
                  'text-border',
                  hasParent && 'hidden desktop:inline',
                )}
              >
                /
              </span>
              {parentPage ? (
                <>
                  <Link to={parentPage.to} className='hover:text-foreground'>
                    {parentPage.label}
                  </Link>
                  <span aria-hidden='true' className='text-border'>
                    /
                  </span>
                  <span className='text-foreground' aria-current='page'>
                    {parentPage.title}
                  </span>
                </>
              ) : (
                <span className='text-foreground' aria-current='page'>
                  {current?.label ??
                    {
                      '/accounts': '账号管理',
                      '/profile': '账号资料',
                      '/me': '我的',
                    }[location.pathname] ??
                    '页面'}
                </span>
              )}
            </nav>
            <Link
              to='/me'
              className='flex min-h-11 items-center gap-2 text-xs text-muted-foreground desktop:hidden'
              aria-label='进入我的账号'
            >
              <UserRound className='size-4' />
              <span className='max-w-28 truncate'>
                {active?.username ?? '登录账号'}
              </span>
            </Link>
            <span className='hidden max-w-[45%] desktop:flex items-center gap-2 truncate text-[11px] text-muted-foreground'>
              <span className='size-1.5 shrink-0 rounded-full bg-[#ab8751]' />
              {active?.schoolName ?? '尚未连接账号'}
              <ArrowUpRight
                className='hidden size-3 sm:block'
                aria-hidden='true'
              />
            </span>
          </header>
          {accountError &&
            !['/accounts', '/accounts/login', '/login', '/profile'].includes(
              location.pathname,
            ) && (
              <div
                role='alert'
                className='border-b border-destructive/20 bg-destructive/5 px-6 py-3 text-sm text-destructive'
              >
                {accountError.message}
              </div>
            )}
          <main
            id='main-content'
            tabIndex={-1}
            className={cn(
              'mx-auto max-w-[1440px] px-5 outline-none desktop:px-9 lg:px-12',
              compact ? 'py-6' : 'py-8 lg:py-10',
            )}
          >
            {updateVersion && (
              <Link
                to='/settings'
                className='mb-5 block rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-primary'
              >
                发现新版本 {updateVersion}，查看更新说明与下载
              </Link>
            )}
            <Outlet />
          </main>
        </div>
      </div>
      <nav
        aria-label='移动端导航'
        className='z-40 grid shrink-0 grid-cols-4 border-t border-border bg-card pt-1 px-2 pb-[max(0.5rem,var(--native-safe-bottom,env(safe-area-inset-bottom)))] desktop:hidden keyboard-open:hidden'
      >
        {[
          { to: '/', label: '大盘', icon: LayoutDashboard },
          { to: '/records', label: '记录', icon: Footprints },
          { to: '/studio', label: '生成', icon: WandSparkles },
          { to: '/me', label: '我的', icon: UserRound },
        ].map(({ to, label, icon: Icon }) => {
          const selected =
            to === '/'
              ? location.pathname === '/'
              : to === '/me'
                ? [
                    '/me',
                    '/school',
                    '/settings',
                    '/accounts',
                    '/profile',
                    '/login',
                  ].some((path) => location.pathname === path)
                : location.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              aria-current={selected ? 'page' : undefined}
              className={cn(
                'flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[10px] transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                selected
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground',
              )}
            >
              <Icon className='size-5' aria-hidden='true' />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
