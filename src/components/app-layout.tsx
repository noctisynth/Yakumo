import { ArrowUpRight, Cloud, House, Settings2 } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { usePreferencesStore } from '@/stores/preferences-store';

const navigation = [
  { to: '/', label: '概览', icon: House },
  { to: '/settings', label: '偏好设置', icon: Settings2 },
];

export function AppLayout() {
  const compact = usePreferencesStore((state) => state.compact);

  return (
    <div className='min-h-svh bg-background text-foreground'>
      <button
        type='button'
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
        className='sr-only z-50 rounded-md bg-primary p-3 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3'
      >
        跳到主要内容
      </button>
      <div className='mx-auto flex min-h-svh max-w-[1600px] flex-col md:flex-row'>
        <aside className='flex shrink-0 flex-col border-b border-border/70 p-5 md:sticky md:top-0 md:h-svh md:w-60 md:border-r md:border-b-0 md:p-7'>
          <NavLink
            to='/'
            aria-label='八云爱首页'
            className='flex items-center gap-3'
          >
            <span className='flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground'>
              <Cloud className='size-6' strokeWidth={1.6} aria-hidden='true' />
            </span>
            <span>
              <span className='block text-lg font-semibold tracking-wide'>
                八云爱
              </span>
              <span className='block text-[10px] tracking-[0.28em] text-muted-foreground uppercase'>
                yakumo
              </span>
            </span>
          </NavLink>
          <nav
            aria-label='主导航'
            className='mt-6 flex gap-2 md:mt-12 md:flex-col'
          >
            {navigation.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                    isActive
                      ? 'bg-accent font-medium text-accent-foreground'
                      : 'text-muted-foreground',
                  )
                }
              >
                <Icon className='size-4' aria-hidden='true' />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className='mt-auto hidden pt-8 md:block'>
            <div className='rounded-2xl border border-border/70 p-4'>
              <ArrowUpRight
                className='mb-3 size-4 text-primary'
                aria-hidden='true'
              />
              <p className='text-xs leading-6 text-muted-foreground'>
                把时间留给热爱，
                <br />
                把选择留给自己。
              </p>
            </div>
            <p className='mt-5 text-[10px] tracking-[0.15em] text-muted-foreground'>
              YOUR PACE. YOUR SPACE.
            </p>
          </div>
        </aside>
        <div className='min-w-0 flex-1'>
          <header className='flex h-20 items-center justify-between border-b border-border/70 px-6 md:px-10 lg:px-14'>
            <p className='text-xs tracking-wide text-muted-foreground'>
              属于你的跑步数据空间
            </p>
            <Badge variant='outline' className='gap-2 rounded-full px-3 py-1'>
              <span className='size-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400' />
              离线工作台
            </Badge>
          </header>
          <main
            id='main-content'
            tabIndex={-1}
            className={cn(
              'mx-auto max-w-6xl px-6 outline-none md:px-10 lg:px-14',
              compact ? 'py-6' : 'py-10 md:py-14',
            )}
          >
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
