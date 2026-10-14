import { MapPin, ShieldCheck } from 'lucide-react';
import { AccountRequired } from '@/components/account-required';
import { SchoolSettingsPanel } from '@/components/school-settings-panel';
import { useDashboardAccount } from '@/hooks/use-dashboard-account';

export function SchoolPage() {
  const { active, ready } = useDashboardAccount();
  if (!ready) return <AccountRequired />;
  return (
    <div className='space-y-7'>
      <div>
        <p className='text-[10px] tracking-[0.25em] text-muted-foreground'>
          SCHOOL / 03
        </p>
        <h1 className='mt-3 text-3xl font-semibold tracking-tight'>
          先了解要求，再出发。
        </h1>
        <p className='mt-3 text-sm text-muted-foreground'>
          {active?.schoolName} · 当前运动配置
        </p>
      </div>
      <div className='grid gap-6 xl:grid-cols-[1fr_260px]'>
        <SchoolSettingsPanel key={active?.id} />
        <aside className='space-y-6 border-t border-border pt-6 xl:border-t-0 xl:border-l xl:pt-1 xl:pl-6'>
          <div>
            <MapPin className='mb-3 size-5 text-primary' />
            <h2 className='text-sm font-medium'>位置由你决定</h2>
            <p className='mt-2 text-xs leading-6 text-muted-foreground'>
              只发送本次输入的查询坐标，不读取设备定位，也不保存坐标。
            </p>
          </div>
          <div>
            <ShieldCheck className='mb-3 size-5 text-primary' />
            <h2 className='text-sm font-medium'>仅查询学校要求</h2>
            <p className='mt-2 text-xs leading-6 text-muted-foreground'>
              读取配置不会开始运动。阈值和开关以学校返回为准，未知项不会被视为没有要求。
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
