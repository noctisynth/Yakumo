import { AlertCircle, LoaderCircle } from 'lucide-react';
import { Link } from 'react-router';
import type { DataResource } from '@/models/exercise';

export function DataFeedback({ resource }: { resource: DataResource }) {
  return (
    <div className='space-y-2 text-xs'>
      {resource.loading && (
        <p
          role='status'
          className='flex items-center gap-2 text-muted-foreground'
        >
          <LoaderCircle className='size-3.5 animate-spin' aria-hidden='true' />
          正在读取学校数据…
        </p>
      )}
      {resource.error && (
        <div
          role='alert'
          className='flex flex-wrap items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-destructive'
        >
          <AlertCircle
            className='mt-0.5 size-3.5 shrink-0'
            aria-hidden='true'
          />
          <div className='min-w-0 flex-1 space-y-1'>
            <p>{resource.error.message}</p>
            <p className='text-[11px]'>
              {resource.error.httpStatus != null
                ? `HTTP ${resource.error.httpStatus}`
                : ''}
              {resource.error.businessCode != null
                ? ` · 业务码 ${resource.error.businessCode}`
                : ''}
              {resource.data !== null ? ' · 下方保留上次读取的数据' : ''}
            </p>
            {resource.error.code === 'session_expired' && (
              <Link to='/accounts' className='underline'>
                前往重新登录
              </Link>
            )}
          </div>
        </div>
      )}
      {resource.updatedAt !== null && (
        <p className='text-[11px] text-muted-foreground'>
          更新于 {new Date(resource.updatedAt).toLocaleTimeString('zh-CN')}
        </p>
      )}
    </div>
  );
}
