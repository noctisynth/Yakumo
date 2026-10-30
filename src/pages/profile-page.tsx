import { RefreshCw, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AccountRequired } from '@/components/account-required';
import { AvatarEditor } from '@/components/avatar-editor';
import { DataFeedback } from '@/components/data-feedback';
import { ProfileDetails } from '@/components/profile-details';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDashboardAccount } from '@/hooks/use-dashboard-account';
import { object, text } from '@/lib/exercise-data';
import {
  profileField,
  profileGroups,
  profileValue,
} from '@/lib/profile-fields';
import { useAccountsStore } from '@/stores/accounts-store';
import { useDashboardStore } from '@/stores/dashboard-store';

export function ProfilePage() {
  const { active, ready } = useDashboardAccount();
  const pending = useAccountsStore((state) => state.pending);
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
    void useAccountsStore.getState().refreshIdentity(active.id);
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
            查看你的个人信息和学籍资料。
          </p>
        </div>
        <Button
          variant='outline'
          disabled={profile.loading || pending}
          onClick={() => {
            void read('profile', { kind: 'profile' });
            if (active)
              void useAccountsStore.getState().refreshIdentity(active.id);
          }}
        >
          <RefreshCw
            className={
              profile.loading || pending ? 'size-4 animate-spin' : 'size-4'
            }
          />
          刷新资料
        </Button>
      </div>
      {active && (
        <AvatarEditor
          key={active.id}
          accountId={active.id}
          avatarUrl={active.avatarUrl}
        >
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
        </AvatarEditor>
      )}
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
              按类别查看资料，也可搜索具体内容。
            </p>
          </div>
          <label className='relative' htmlFor='profile-search'>
            <Search className='absolute top-3 left-3 size-4 text-muted-foreground' />
            <Input
              id='profile-search'
              aria-label='搜索资料'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className='pl-9'
              placeholder='搜索资料名称或内容'
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
                          <ProfileDetails value={value} />
                        </details>
                      ) : (
                        (translated ??
                        (String(value) || (
                          <span className='text-muted-foreground'>未填写</span>
                        )))
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          );
          return group === '其他编号' ? (
            <details
              key={group}
              open={query ? true : undefined}
              className='border-t border-border'
            >
              <summary className='cursor-pointer px-5 py-4 text-sm font-medium'>
                其他编号{' '}
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
                ? '没有找到匹配的资料。'
                : '暂无资料，请刷新重试。'}
          </p>
        )}
      </section>
    </div>
  );
}
