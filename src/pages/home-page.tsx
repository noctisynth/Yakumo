import {
  Activity,
  ArrowRight,
  CalendarDays,
  Flag,
  RefreshCw,
  Route,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { DataFeedback } from '@/components/data-feedback';
import { MileageChart } from '@/components/mileage-chart';
import { RecordsPanel } from '@/components/records-panel';
import { SchoolSettingsPanel } from '@/components/school-settings-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useDashboardAccount } from '@/hooks/use-dashboard-account';
import { object, quantity, text } from '@/lib/exercise-data';
import { useDashboardStore } from '@/stores/dashboard-store';

const modes = [
  ['sunRun', '阳光跑'],
  ['morningRun', '晨跑'],
  ['freedomRun', '自由跑'],
  ['directionRun', '定向跑'],
  ['IndoorRun', '室内跑'],
  ['exerciseSite', '场地运动'],
] as const;

export function HomePage() {
  const { active, ready, initialized } = useDashboardAccount();
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
  if (!ready)
    return (
      <section className='mx-auto max-w-2xl rounded-3xl border border-border/70 bg-card px-7 py-14 sm:px-12'>
        <Activity className='mb-8 size-8 text-primary' aria-hidden='true' />
        <Badge variant='secondary'>八云爱 · 跑步数据大盘</Badge>
        <h1 className='mt-5 text-3xl leading-tight font-semibold'>
          {!initialized
            ? '正在准备你的数据空间'
            : active?.expired
              ? '重新登录，继续查看进度'
              : active
                ? '正在切换数据空间'
                : '登录后，进度一目了然'}
        </h1>
        <p className='mt-4 text-sm leading-7 text-muted-foreground'>
          在这里查看学校返回的跑步统计、运动记录和当前要求。使用左下角账户卡片切换账号，各账号的数据分别展示。
        </p>
        <Button asChild className='mt-7 h-10'>
          <Link to='/accounts'>
            管理登录账号
            <ArrowRight className='size-4' aria-hidden='true' />
          </Link>
        </Button>
        <p className='mt-8 flex items-center gap-2 text-xs text-muted-foreground'>
          <ShieldCheck className='size-4' aria-hidden='true' />
          只读数据，不会自动开始运动或提交记录。
        </p>
      </section>
    );
  const statistics = object(dashboard.statistics.data);
  const summary = object(dashboard.summary.data);
  const busy =
    dashboard.statistics.loading ||
    dashboard.summary.loading ||
    dashboard.records.loading;
  const metrics = [
    {
      title: '累计里程',
      field: 'allTotalMileage',
      unit: 'km',
      icon: Route,
      note: '学校累计统计',
    },
    {
      title: '累计次数',
      field: 'allNum',
      unit: '次',
      icon: Activity,
      note: '与有效次数分别展示',
    },
    {
      title: '本周里程',
      field: 'weekTotalMileage',
      unit: 'km',
      icon: CalendarDays,
      note: '学校本周统计',
    },
    {
      title: '本学期里程',
      field: 'sysTermTotalMileage',
      unit: 'km',
      icon: Flag,
      note: '学校当前学期统计',
    },
  ];
  return (
    <div className='space-y-7'>
      <section className='flex flex-wrap items-center justify-between gap-4'>
        <div>
          <p className='mb-2 text-[10px] font-medium tracking-[0.2em] text-primary uppercase'>
            your running overview
          </p>
          <h1 className='text-3xl font-semibold tracking-tight'>
            跑步数据大盘
          </h1>
          <p className='mt-2 text-sm text-muted-foreground'>
            {active?.username} · {active?.schoolName}
          </p>
        </div>
        <Button
          variant='outline'
          className='h-10 gap-2'
          disabled={busy}
          onClick={() => {
            void dashboard.overview();
          }}
        >
          <RefreshCw
            className={`size-4 ${busy ? 'animate-spin' : ''}`}
            aria-hidden='true'
          />
          {busy ? '正在刷新' : '刷新数据'}
        </Button>
      </section>
      <section aria-label='关键跑步统计' className='space-y-3'>
        <DataFeedback resource={dashboard.statistics} />
        <div className='grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4'>
          {metrics.map(({ title, field, unit, icon: Icon, note }) => (
            <Card
              key={field}
              className='gap-4 rounded-2xl border-border/70 shadow-none'
            >
              <CardHeader className='flex flex-row items-center justify-between'>
                <CardTitle className='text-sm font-normal text-muted-foreground'>
                  {title}
                </CardTitle>
                <Icon className='size-4 text-primary' aria-hidden='true' />
              </CardHeader>
              <CardContent>
                <p
                  className={`break-all text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl ${dashboard.statistics.loading && dashboard.statistics.data === null ? 'animate-pulse' : ''}`}
                >
                  {quantity(statistics[field])}
                  <span className='ml-2 text-xs font-normal text-muted-foreground'>
                    {unit}
                  </span>
                </p>
                <p className='mt-3 text-[11px] text-muted-foreground'>{note}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
      <section className='grid gap-5 xl:grid-cols-[1.15fr_1fr]'>
        <Card className='rounded-2xl border-border/70 shadow-none'>
          <CardHeader>
            <CardTitle className='text-lg'>各类运动进度</CardTitle>
            <CardDescription>
              有效次数和里程来自学校汇总，不由本地推算。
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <DataFeedback resource={dashboard.summary} />
            <div className='grid grid-cols-2 gap-3'>
              {modes.map(([key, label]) => {
                const mode = object(summary[key]);
                return (
                  <div
                    key={key}
                    className='rounded-xl border border-border/60 p-4'
                  >
                    <div className='flex items-center justify-between gap-2'>
                      <p className='text-sm font-medium'>{label}</p>
                      {text(mode.isShow, '') === '0' && (
                        <span className='text-[10px] text-muted-foreground'>
                          学校未启用
                        </span>
                      )}
                    </div>
                    <p className='mt-3 text-xl font-semibold tabular-nums'>
                      {quantity(mode.succeed, 0)}
                      <span className='ml-1 text-xs font-normal text-muted-foreground'>
                        次有效
                      </span>
                    </p>
                    <p className='mt-1 text-xs text-muted-foreground'>
                      {quantity(mode.runSportRange)} km
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
        <Card className='rounded-2xl border-border/70 shadow-none'>
          <CardHeader>
            <CardTitle className='text-lg'>日期里程分布</CardTitle>
            <CardDescription>
              当前记录筛选下，学校返回的日期分组。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MileageChart dates={object(dashboard.records.data).dates} />
            <div className='mt-5 rounded-xl bg-muted/50 p-4 text-xs leading-6 text-muted-foreground'>
              统计、汇总与列表可能使用不同口径或更新时间。缺失数据以“—”展示，暂不推断学期达标结论。
            </div>
          </CardContent>
        </Card>
      </section>
      <RecordsPanel />
      <SchoolSettingsPanel key={active?.id} />
      <p className='text-[11px] leading-6 text-muted-foreground'>
        当前页面仅读取学校数据。配置读取不会调用开始接口，任何记录提交都不在本页执行。
      </p>
    </div>
  );
}
