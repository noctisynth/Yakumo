import { profileField, profileValue } from '@/lib/profile-fields';
import type { JsonValue } from '@/models/exercise';

export function ProfileDetails({ value }: { value: JsonValue }) {
  if (value === null) return <span>未提供</span>;
  if (typeof value !== 'object')
    return (
      <span>
        {typeof value === 'boolean'
          ? value
            ? '是'
            : '否'
          : String(value) || '未填写'}
      </span>
    );
  const entries = Object.entries(value);
  if (!entries.length) return <span>暂无详细资料</span>;
  return (
    <dl className='mt-3 space-y-3 border-l border-border pl-3'>
      {entries.map(([key, item]) => (
        <div key={key} className='min-w-0'>
          <dt className='text-xs text-muted-foreground'>
            {Array.isArray(value)
              ? `第 ${Number(key) + 1} 项`
              : profileField(key).label}
          </dt>
          <dd className='mt-1 break-words'>
            {profileValue(key, item) ?? <ProfileDetails value={item} />}
          </dd>
        </div>
      ))}
    </dl>
  );
}
