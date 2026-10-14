import {
  ChevronRight,
  IdCard,
  Settings2,
  SlidersHorizontal,
  UsersRound,
} from 'lucide-react';
import { Link } from 'react-router';
import { AccountSwitcher } from '@/components/account-switcher';
import { useDashboardAccount } from '@/hooks/use-dashboard-account';

const links = [
  {
    to: '/profile',
    label: '当前账号资料',
    description: '查看个人与学校资料',
    icon: IdCard,
  },
  {
    to: '/school',
    label: '学校运动配置',
    description: '查看距离、时长和步数要求',
    icon: SlidersHorizontal,
  },
  {
    to: '/accounts',
    label: '账号管理',
    description: '添加、登录或移除已保存账号',
    icon: UsersRound,
  },
  {
    to: '/settings',
    label: '偏好设置',
    description: '深浅主题与布局偏好',
    icon: Settings2,
  },
];
export function MePage() {
  const { active } = useDashboardAccount();
  return (
    <div className='space-y-6'>
      <header>
        <p className='text-[10px] tracking-[0.25em] text-muted-foreground'>
          YOUR PERSONAL SPACE
        </p>
        <h1 className='mt-3 text-3xl font-semibold'>我的空间</h1>
        <p className='mt-3 text-sm text-muted-foreground'>
          {active
            ? '管理账号，按自己的节奏前进。'
            : '登录账号，开启你的跑步数据空间。'}
        </p>
      </header>
      <section
        aria-label='当前账户'
        className='rounded-xl border border-border bg-card p-5'
      >
        <h2 className='mb-4 text-sm font-medium'>当前账户</h2>
        <AccountSwitcher />
      </section>
      <nav
        aria-label='个人空间功能'
        className='overflow-hidden rounded-xl border border-border bg-card'
      >
        {links.map(({ to, label, description, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className='flex min-h-20 items-center gap-4 border-b border-border p-5 last:border-b-0 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring'
          >
            <span className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'>
              <Icon className='size-5' aria-hidden='true' />
            </span>
            <span className='min-w-0 flex-1'>
              <span className='block text-sm font-medium'>{label}</span>
              <span className='mt-1 block text-xs leading-5 text-muted-foreground'>
                {description}
              </span>
            </span>
            <ChevronRight
              className='size-4 shrink-0 text-muted-foreground'
              aria-hidden='true'
            />
          </Link>
        ))}
      </nav>
    </div>
  );
}
