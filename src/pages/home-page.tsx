import {
  ArrowRight,
  Check,
  Eye,
  Route,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useApplicationInfo } from '@/hooks/use-application-info';

const steps = [
  {
    number: '01',
    icon: SlidersHorizontal,
    title: '按你的节奏准备',
    description: '读取运动要求，自主选择数据参数。',
  },
  {
    number: '02',
    icon: Eye,
    title: '先看清，再决定',
    description: '预览路线与数据，核对每一项细节。',
  },
  {
    number: '03',
    icon: Route,
    title: '每次提交有回音',
    description: '查询记录状态，了解实际处理结果。',
  },
];

export function HomePage() {
  const { info, error } = useApplicationInfo();

  return (
    <div className='space-y-10'>
      <section className='relative overflow-hidden rounded-3xl border border-primary/10 bg-primary/5 px-7 py-10 sm:px-10 sm:py-12'>
        <div
          aria-hidden='true'
          className='pointer-events-none absolute -top-24 -right-16 size-80 rounded-full border-[40px] border-primary/5 sm:size-[400px]'
        />
        <div className='relative max-w-xl'>
          <Badge
            variant='secondary'
            className='mb-7 rounded-full bg-background/70 px-3 py-1 text-primary'
          >
            你好，欢迎来到八云爱
          </Badge>
          <h1 className='text-4xl leading-tight font-semibold tracking-tight sm:text-5xl sm:leading-tight'>
            让每一步，
            <br />
            都由你掌握。
          </h1>
          <p className='mt-5 max-w-md text-sm leading-7 text-muted-foreground sm:text-base'>
            一个清晰、可控的跑步数据空间。
            <br className='hidden sm:block' />
            少一点打扰，多一点属于自己的时间。
          </p>
          <Button asChild className='mt-8 h-11 rounded-xl px-5'>
            <Link to='/settings'>
              设置我的工作台
              <ArrowRight className='size-4' aria-hidden='true' />
            </Link>
          </Button>
        </div>
      </section>
      <section aria-labelledby='workflow-title'>
        <div className='mb-5 flex flex-wrap items-end justify-between gap-2'>
          <div>
            <p className='mb-2 text-[10px] font-medium tracking-[0.2em] text-primary uppercase'>
              a little more freedom
            </p>
            <h2
              id='workflow-title'
              className='text-xl font-semibold tracking-tight'
            >
              从准备，到每一步的确认
            </h2>
          </div>
          <span className='text-xs text-muted-foreground'>功能正在准备中</span>
        </div>
        <div className='grid gap-4 lg:grid-cols-3'>
          {steps.map(({ number, icon: Icon, title, description }) => (
            <Card
              key={number}
              className='gap-4 rounded-2xl border-border/70 shadow-none'
            >
              <CardHeader>
                <div className='mb-5 flex items-center justify-between'>
                  <Icon
                    className='size-5 text-primary'
                    strokeWidth={1.6}
                    aria-hidden='true'
                  />
                  <span className='font-mono text-xs text-muted-foreground/70'>
                    {number}
                  </span>
                </div>
                <CardTitle className='text-base'>{title}</CardTitle>
                <CardDescription className='leading-6'>
                  {description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Badge
                  variant='outline'
                  className='font-normal text-muted-foreground'
                >
                  即将接入
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
      <section
        className='flex flex-col justify-between gap-6 rounded-2xl border border-border/70 bg-card px-6 py-6 sm:flex-row sm:items-center'
        aria-labelledby='privacy-title'
      >
        <div className='flex items-start gap-4'>
          <span className='flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary'>
            <ShieldCheck className='size-5' aria-hidden='true' />
          </span>
          <div>
            <h2 id='privacy-title' className='text-sm font-medium'>
              清爽，从尊重你的选择开始
            </h2>
            <p className='mt-2 text-xs leading-6 text-muted-foreground'>
              当前工作台离线运行。账号和运动功能将在后续接入。
            </p>
          </div>
        </div>
        <div className='flex shrink-0 gap-4 text-xs text-muted-foreground'>
          {['无广告', '无追踪'].map((label) => (
            <span key={label} className='flex items-center gap-1.5'>
              <Check className='size-3.5 text-primary' aria-hidden='true' />
              {label}
            </span>
          ))}
        </div>
      </section>
      <footer className='flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground'>
        <span>八云爱 · 为自主而来</span>
        <span role='status'>
          {error ??
            (info
              ? `v${info.version} · ${info.runtime === 'native' ? '桌面应用' : '浏览器预览'}`
              : '正在读取应用信息…')}
        </span>
      </footer>
    </div>
  );
}
