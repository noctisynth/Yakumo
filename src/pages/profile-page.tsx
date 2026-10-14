import { RefreshCw, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AccountAvatar } from '@/components/account-avatar';
import { AccountRequired } from '@/components/account-required';
import { DataFeedback } from '@/components/data-feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDashboardAccount } from '@/hooks/use-dashboard-account';
import { object, text } from '@/lib/exercise-data';
import {
  profileField,
  profileGroups,
  profileValue,
} from '@/lib/profile-fields';
import { useDashboardStore } from '@/stores/dashboard-store';

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
    `${profileField(key).label} ${profileField(key).group} ${profileValue(key, value) ?? ''} ${key} ${JSON.stringify(value)}`
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
        <AccountAvatar
          key={active?.id}
          avatarUrl={active?.avatarUrl}
          className='size-16 rounded-xl'
        />
        <div className='min-w-0'>
          <h2 className='break-words text-xl font-semibold'>
            {text(
              object(profile.data).realName,
              text(
                object(profile.data).name,
                text(object(profile.data).nickName, active?.username),
              ),
            )}
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
              账号资料{' '}
              <span className='ml-2 text-xs font-normal text-muted-foreground'>
                {fields.length} 项
              </span>
            </h2>
            <p className='mt-1 text-xs text-muted-foreground'>
              按资料类别整理；状态含义未确认时保留学校原值。
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
        {profileGroups.map((group) => {
          const groupFields = visible.filter(
            ([key]) => profileField(key).group === group,
          );
          if (!groupFields.length) return null;
          const content = (
            <dl key={group} className='grid sm:grid-cols-2'>
              {groupFields.map(([key, value]) => {
                const field = profileField(key);
                const translated = profileValue(key, value);
                return (
                  <div
                    key={key}
                    className='min-w-0 border-t border-border/60 p-5'
                  >
                    <dt className='text-xs text-muted-foreground'>
                      {field.label}
                      <span className='ml-2 break-all text-[10px] text-muted-foreground/65'>
                        {key}
                      </span>
                    </dt>
                    <dd className='mt-2 break-words text-sm'>
                      {value === null ? (
                        <span className='text-muted-foreground'>
                          学校未提供
                        </span>
                      ) : typeof value === 'object' ? (
                        <details>
                          <summary className='cursor-pointer text-primary'>
                            查看详细内容
                          </summary>
                          <pre className='mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs'>
                            {JSON.stringify(value, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        (translated ??
                        (String(value) || (
                          <span className='text-muted-foreground'>未填写</span>
                        )))
                      )}
                    </dd>
                    {field.hint && translated === undefined && (
                      <p className='mt-2 text-[11px] leading-5 text-muted-foreground'>
                        {field.hint}
                      </p>
                    )}
                  </div>
                );
              })}
            </dl>
          );
          return group === '系统标识' ? (
            <details
              key={group}
              open={query ? true : undefined}
              className='border-t border-border'
            >
              <summary className='cursor-pointer px-5 py-4 text-sm font-medium'>
                系统标识{' '}
                <span className='ml-2 text-xs font-normal text-muted-foreground'>
                  {groupFields.length} 项 · 按需查看
                </span>
              </summary>
              {content}
            </details>
          ) : (
            <section
              key={group}
              aria-label={group}
              className='border-t border-border'
            >
              <h3 className='px-5 py-4 text-sm font-medium'>
                {group}{' '}
                <span className='ml-2 text-xs font-normal text-muted-foreground'>
                  {groupFields.length} 项
                </span>
              </h3>
              {content}
            </section>
          );
        })}
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
