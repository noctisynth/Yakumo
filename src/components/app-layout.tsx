import {
  ArrowUpRight,
  Footprints,
  LayoutDashboard,
  ListFilter,
  Settings2,
  SlidersHorizontal,
} from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { AccountSwitcher } from '@/components/account-switcher';
import { useDashboardAccount } from '@/hooks/use-dashboard-account';
import { cn } from '@/lib/utils';
import { useAccountsStore } from '@/stores/accounts-store';
import { usePreferencesStore } from '@/stores/preferences-store';

const navigation = [
  { to: '/', label: '数据大盘', detail: 'Overview', icon: LayoutDashboard },
  { to: '/records', label: '运动记录', detail: 'Activity', icon: Footprints },
  {
    to: '/school',
    label: '学校配置',
    detail: 'School',
    icon: SlidersHorizontal,
  },
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
  const current = navigation.find((item) =>
    item.to === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(item.to),
  );
  return (
    <div className='min-h-svh bg-background text-foreground'>
      <button
        type='button'
        onClick={() => document.getElementById('main-content')?.focus()}
        className='sr-only z-50 bg-primary p-3 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3'
      >
        跳到主要内容
      </button>
      <div className='mx-auto flex min-h-svh max-w-[1920px] flex-col md:flex-row'>
        <aside className='z-20 flex shrink-0 flex-col bg-[#191c35] px-5 py-5 text-[#f4f0e7] md:sticky md:top-0 md:h-svh md:w-60 md:px-5 md:py-8 lg:w-64'>
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
          <p className='mt-12 mb-4 hidden px-3 text-[10px] tracking-[0.22em] text-white/30 md:block'>
            WORKSPACE
          </p>
          <nav
            aria-label='主导航'
            className='mt-5 grid grid-cols-2 gap-2 md:mt-0 md:grid-cols-1'
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
                  <span className='mt-0.5 hidden text-[10px] tracking-wide text-white/35 md:block'>
                    {detail}
                  </span>
                </span>
                <span className='hidden text-[10px] tabular-nums text-white/25 md:block'>
                  0{index + 1}
                </span>
              </NavLink>
            ))}
          </nav>
          <div className='mt-auto hidden px-3 pt-12 pb-6 md:block'>
            <div className='mb-4 h-px w-7 bg-[#e8c784]/60' />
            <p className='text-sm leading-7 text-white/75'>
              把时间，还给自己。
            </p>
            <p className='mt-2 text-[10px] leading-5 tracking-wide text-white/35'>
              YOUR PACE. YOUR SPACE.
            </p>
          </div>
          <div className='mt-5 rounded-xl bg-background p-1 text-foreground md:mt-0'>
            <AccountSwitcher />
          </div>
        </aside>
        <div className='min-w-0 flex-1'>
          <header className='flex h-16 items-center justify-between gap-3 border-b border-border px-5 md:px-9 lg:px-12'>
            <p className='flex items-center gap-2 text-xs text-muted-foreground'>
              <ListFilter className='size-3.5' aria-hidden='true' />
              <span>工作空间</span>
              <span className='text-border'>/</span>
              <span className='text-foreground'>
                {current?.label ??
                  (location.pathname === '/accounts' ? '账号管理' : '页面')}
              </span>
            </p>
            <span className='flex max-w-[45%] items-center gap-2 truncate text-[11px] text-muted-foreground'>
              <span className='size-1.5 shrink-0 rounded-full bg-[#ab8751]' />
              {active?.schoolName ?? '尚未连接账号'}
              <ArrowUpRight
                className='hidden size-3 sm:block'
                aria-hidden='true'
              />
            </span>
          </header>
          {accountError && location.pathname !== '/accounts' && (
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
              'mx-auto max-w-[1440px] px-5 outline-none md:px-9 lg:px-12',
              compact ? 'py-6' : 'py-8 lg:py-10',
            )}
          >
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
