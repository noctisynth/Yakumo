import { RefreshCw, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AccountRequired } from '@/components/account-required';
import { DataFeedback } from '@/components/data-feedback';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDashboardAccount } from '@/hooks/use-dashboard-account';
import { object, text } from '@/lib/exercise-data';
import { useDashboardStore } from '@/stores/dashboard-store';

const labels: Record<string, string> = {
  realName: '姓名',
  name: '姓名',
  username: '账号',
  userId: '用户标识',
  id: '标识',
  sex: '性别（原值）',
  phone: '手机号码',
  email: '电子邮箱',
  schoolName: '学校',
  collegeName: '学院',
  majorName: '专业',
  className: '班级',
  studentNumber: '学号',
  grade: '年级',
  birthday: '出生日期',
  height: '身高（原值）',
  weight: '体重（原值）',
  createTime: '创建时间',
  updateTime: '更新时间',
};
export function ProfilePage() {
  const { active, ready } = useDashboardAccount();
  const { profile, read } = useDashboardStore();
  const loaded = useRef<string | null>(null);
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (!ready || !active) {
      loaded.current = null;
      return;
    }
    if (loaded.current === active.id) return;
    loaded.current = active.id;
    setSearch('');
    void useDashboardStore.getState().read('profile', { kind: 'profile' });
  }, [ready, active]);
  if (!ready) return <AccountRequired />;
  const fields = Object.entries(object(profile.data));
  const query = search.trim().toLowerCase();
  const visible = fields.filter(([key, value]) =>
    `${labels[key] ?? ''} ${key} ${JSON.stringify(value)}`
      .toLowerCase()
      .includes(query),
  );
  return (
    <div className='space-y-7'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-[10px] tracking-[0.25em] text-muted-foreground'>
            IDENTITY / YOUR PROFILE
          </p>
          <h1 className='mt-3 text-3xl font-semibold'>当前账号资料</h1>
          <p className='mt-3 text-sm text-muted-foreground'>
            学校返回的个人资料，集中查看，清晰归属。
          </p>
        </div>
        <Button
          variant='outline'
          disabled={profile.loading}
          onClick={() => void read('profile', { kind: 'profile' })}
        >
          <RefreshCw className='size-4' />
          刷新资料
        </Button>
      </div>
      <section className='flex items-center gap-5 rounded-xl border border-border bg-card p-6'>
        <Avatar className='size-16 rounded-xl'>
          {active?.avatarUrl && <AvatarImage src={active.avatarUrl} alt='' />}
          <AvatarFallback>
            {Array.from(active?.username ?? '我')[0]}
          </AvatarFallback>
        </Avatar>
        <div className='min-w-0'>
          <h2 className='break-words text-xl font-semibold'>
            {text(object(profile.data).realName, active?.username)}
          </h2>
          <p className='mt-2 text-xs text-muted-foreground'>
            {active?.schoolName} · {active?.username}
          </p>
        </div>
        <span className='ml-auto hidden text-[10px] tracking-[0.2em] text-primary sm:block'>
          PERSONAL IDENTITY
        </span>
      </section>
      <DataFeedback resource={profile} />
      <section className='rounded-xl border border-border bg-card'>
        <div className='flex flex-wrap items-center justify-between gap-4 border-b border-border p-5'>
          <div>
            <h2 className='text-sm font-semibold'>
              全部资料字段{' '}
              <span className='ml-2 text-xs font-normal text-muted-foreground'>
                {fields.length} 项
              </span>
            </h2>
            <p className='mt-1 text-xs text-muted-foreground'>
              保留学校原始字段名、空值与未识别内容；凭据及敏感协议材料已排除。
            </p>
          </div>
          <label className='relative' htmlFor='profile-search'>
            <Search className='absolute top-3 left-3 size-4 text-muted-foreground' />
            <Input
              id='profile-search'
              aria-label='搜索资料字段'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className='pl-9'
              placeholder='搜索字段或内容'
            />
          </label>
        </div>
        <dl className='grid sm:grid-cols-2'>
          {visible.map(([key, value]) => (
            <div key={key} className='min-w-0 border-b border-border p-5'>
              <dt className='text-xs text-muted-foreground'>
                {labels[key] ?? key}
                {labels[key] && (
                  <span className='ml-2 text-[10px] opacity-70'>{key}</span>
                )}
              </dt>
              <dd className='mt-2 break-words text-sm'>
                {value === null ? (
                  <span className='text-muted-foreground'>未提供（null）</span>
                ) : typeof value === 'object' ? (
                  <details>
                    <summary className='cursor-pointer text-primary'>
                      查看嵌套内容
                    </summary>
                    <pre className='mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs'>
                      {JSON.stringify(value, null, 2)}
                    </pre>
                  </details>
                ) : (
                  String(value) || '空字符串'
                )}
              </dd>
            </div>
          ))}
        </dl>
        {!visible.length && (
          <p className='p-8 text-center text-sm text-muted-foreground'>
            {profile.loading
              ? '正在读取资料…'
              : search
                ? '没有匹配字段。'
                : '暂无资料，请刷新重试。'}
          </p>
        )}
      </section>
    </div>
  );
}
