import { ArrowRight, ArrowUpRight, RefreshCw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { AccountRequired } from '@/components/account-required';
import { DataFeedback } from '@/components/data-feedback';
import { MileageChart } from '@/components/mileage-chart';
import { Button } from '@/components/ui/button';
import { useDashboardAccount } from '@/hooks/use-dashboard-account';
import { object, quantity, text } from '@/lib/exercise-data';
import { useDashboardStore } from '@/stores/dashboard-store';

const modes = [
  ['sunRun', '阳光跑', 'SUNSHINE'],
  ['morningRun', '晨跑', 'MORNING'],
  ['freedomRun', '自由跑', 'FREEDOM'],
  ['directionRun', '定向跑', 'DIRECTION'],
  ['IndoorRun', '室内跑', 'INDOOR'],
  ['exerciseSite', '场地运动', 'ON SITE'],
] as const;

export function HomePage() {
  const { active, ready } = useDashboardAccount();
  const dashboard = useDashboardStore();
  const loaded = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !active) {
      loaded.current = null;
      return;
    }
    if (loaded.current === active.id) return;
    loaded.current = active.id;
    void useDashboardStore.getState().overview();
  }, [ready, active]);
  if (!ready) return <AccountRequired />;
  const statistics = object(dashboard.statistics.data);
  const summary = object(dashboard.summary.data);
  const busy =
    dashboard.statistics.loading ||
    dashboard.summary.loading ||
    dashboard.records.loading;
  return (
    <div className='space-y-7 lg:space-y-9'>
      <section className='flex flex-wrap items-end justify-between gap-5'>
        <div>
          <p className='text-[10px] tracking-[0.25em] text-muted-foreground'>
            OVERVIEW / 01
          </p>
          <h1 className='mt-3 text-3xl font-semibold tracking-tight lg:text-4xl'>
            跑步数据大盘
          </h1>
          <p className='mt-3 text-sm text-muted-foreground'>
            {active?.username}，按自己的节奏前进。
          </p>
        </div>
        <Button
          variant='outline'
          className='h-10 gap-2 rounded-md bg-card'
          disabled={busy}
          onClick={() => {
            void dashboard.overview();
          }}
        >
          <RefreshCw
            className={`size-3.5 ${busy ? 'animate-spin' : ''}`}
            aria-hidden='true'
          />
          {busy ? '正在刷新' : '刷新数据'}
        </Button>
      </section>
      <section aria-label='关键跑步统计'>
        <div className='grid overflow-hidden rounded-xl border border-border lg:grid-cols-[1.1fr_1fr]'>
          <div className='relative isolate overflow-hidden bg-[#242943] p-6 text-[#f7f2e8] sm:p-8'>
            <span
              aria-hidden='true'
              className='pointer-events-none absolute -right-5 -bottom-9 -z-10 text-[180px] leading-none font-semibold tracking-tighter text-white/[0.035]'
            >
              RUN
            </span>
            <div className='flex items-center justify-between'>
              <p className='text-xs text-white/65'>累计里程</p>
              <span className='text-[9px] tracking-[0.2em] text-[#e8c784]'>
                TOTAL DISTANCE
              </span>
            </div>
            <p className='mt-7 break-all text-6xl font-light tracking-[-0.06em] tabular-nums sm:text-7xl'>
              {quantity(statistics.allTotalMileage)}
              <span className='ml-3 text-base tracking-normal text-[#e8c784]'>
                km
              </span>
            </p>
            <div className='mt-7 flex items-center justify-between border-t border-white/15 pt-4 text-[11px] text-white/50'>
              <span>学校累计统计</span>
              <Link
                to='/records'
                className='flex items-center gap-2 text-[#f4d99c] hover:text-white'
              >
                查看运动记录
                <ArrowUpRight className='size-3.5' />
              </Link>
            </div>
          </div>
          <div className='grid grid-cols-2 bg-card'>
            <div className='border-r border-b border-border p-5 sm:p-6'>
              <p className='text-xs text-muted-foreground'>本周里程</p>
              <p className='mt-4 break-all text-3xl font-medium tracking-tight tabular-nums'>
                {quantity(statistics.weekTotalMileage)}
                <span className='ml-2 text-xs font-normal text-muted-foreground'>
                  km
                </span>
              </p>
            </div>
            <div className='border-b border-border p-5 sm:p-6'>
              <p className='text-xs text-muted-foreground'>本学期里程</p>
              <p className='mt-4 break-all text-3xl font-medium tracking-tight tabular-nums'>
                {quantity(statistics.sysTermTotalMileage)}
                <span className='ml-2 text-xs font-normal text-muted-foreground'>
                  km
                </span>
              </p>
            </div>
            <div className='border-r border-border p-5 sm:p-6'>
              <p className='text-xs text-muted-foreground'>累计次数</p>
              <p className='mt-4 text-3xl font-medium tabular-nums'>
                {quantity(statistics.allNum, 0)}
                <span className='ml-2 text-xs font-normal text-muted-foreground'>
                  次
                </span>
              </p>
            </div>
            <div className='flex flex-col justify-center p-5 sm:p-6'>
              <span className='mb-2 h-px w-6 bg-[#ab8751]' />
              <p className='text-[11px] leading-5 text-muted-foreground'>
                累计次数与有效次数
                <br />
                分别统计，缺失值为 —
              </p>
            </div>
          </div>
        </div>
        <div className='mt-3'>
          <DataFeedback resource={dashboard.statistics} />
        </div>
      </section>
      <section className='grid gap-7 xl:grid-cols-[1fr_1.05fr]'>
        <div>
          <div className='mb-5 flex items-center justify-between'>
            <div>
              <p className='text-[9px] tracking-[0.18em] text-muted-foreground'>
                BY ACTIVITY
              </p>
              <h2 className='mt-1 text-lg font-semibold'>各类运动进度</h2>
            </div>
            <span className='text-[10px] text-muted-foreground'>
              学校有效汇总
            </span>
          </div>
          <DataFeedback resource={dashboard.summary} />
          <div className='mt-3 grid grid-cols-2 gap-x-6'>
            {modes.map(([key, label, english], index) => {
              const mode = object(summary[key]);
              return (
                <div key={key} className='border-t border-border py-4'>
                  <div className='flex items-center justify-between gap-2'>
                    <p className='text-sm font-medium'>
                      <span className='mr-2 text-[10px] font-normal text-[#ab8751]'>
                        0{index + 1}
                      </span>
                      {label}
                    </p>
                    {text(mode.isShow, '') === '0' && (
                      <span className='text-[9px] text-muted-foreground'>
                        未启用
                      </span>
                    )}
                  </div>
                  <div className='mt-3 flex flex-wrap items-end justify-between gap-1'>
                    <p className='text-2xl font-medium tabular-nums'>
                      {quantity(mode.succeed, 0)}
                      <span className='ml-1 text-[10px] font-normal text-muted-foreground'>
                        次有效
                      </span>
                    </p>
                    <p className='text-[11px] tabular-nums text-muted-foreground'>
                      {quantity(mode.runSportRange)} km
                    </p>
                  </div>
                  <p className='mt-2 text-[8px] tracking-[0.18em] text-muted-foreground/60'>
                    {english}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
        <div className='flex flex-col rounded-xl border border-border bg-card p-5 sm:p-6'>
          <div className='flex items-start justify-between gap-3'>
            <div>
              <p className='text-[9px] tracking-[0.18em] text-muted-foreground'>
                DISTANCE DISTRIBUTION
              </p>
              <h2 className='mt-1 text-lg font-semibold'>日期里程分布</h2>
            </div>
            <span className='rounded-sm bg-muted px-2 py-1 text-[10px] text-muted-foreground'>
              km
            </span>
          </div>
          <p className='mt-2 text-xs text-muted-foreground'>
            来自当前记录筛选的日期分组
          </p>
          <div className='my-auto py-7'>
            <MileageChart dates={object(dashboard.records.data).dates} />
          </div>
          <DataFeedback resource={dashboard.records} />
          <p className='mt-4 border-t border-border pt-4 text-[10px] leading-5 text-muted-foreground'>
            统计、汇总与列表可能采用不同口径。暂不推断学期达标结论。
          </p>
        </div>
      </section>
      <section className='grid gap-3 border-t border-border pt-6 sm:grid-cols-2'>
        {[
          ['/records', '运动记录', '筛选历史运动，查看学校判定。', '02'],
          ['/school', '学校配置', '查询当前距离、时长及步数要求。', '03'],
        ].map(([to, title, description, number]) => (
          <Link
            key={to}
            to={to}
            className='group flex items-center gap-4 rounded-lg border border-transparent px-3 py-4 transition-colors hover:border-border hover:bg-card focus-visible:outline-2 focus-visible:outline-ring'
          >
            <span className='text-3xl font-light text-[#ab8751]/60'>
              {number}
            </span>
            <span className='flex-1'>
              <span className='block text-sm font-medium'>{title}</span>
              <span className='mt-1 block text-xs text-muted-foreground'>
                {description}
              </span>
            </span>
            <ArrowRight className='size-4 text-muted-foreground transition-transform group-hover:translate-x-1' />
          </Link>
        ))}
      </section>
    </div>
  );
}
