import { ArrowLeft, ArrowRight, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { DataFeedback } from '@/components/data-feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  duration,
  items,
  object,
  quantity,
  recordStatus,
  text,
} from '@/lib/exercise-data';
import { useDashboardStore } from '@/stores/dashboard-store';

export function RecordsPanel() {
  const { records, filter, recordsPage } = useDashboardStore();
  const data = object(records.data);
  const rows = items(data.records).map(object);
  const dates = items(data.dates).map(object);
  return (
    <Card className='rounded-2xl border-border/70 shadow-none'>
      <CardHeader>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <CardTitle className='text-lg'>运动记录</CardTitle>
          <Badge variant='outline'>
            {filter.status === '1' ? '合格记录' : '未合格记录'}
          </Badge>
        </div>
        <CardDescription>点击记录查看本次运动的结果与详情。</CardDescription>
      </CardHeader>
      <CardContent className='space-y-5'>
        <div className='flex flex-wrap items-center gap-3'>
          <div className='flex items-center gap-2 text-xs text-muted-foreground'>
            <span>状态</span>
            <Select
              value={filter.status}
              disabled={records.loading}
              onValueChange={(status) => {
                void recordsPage({ ...filter, status, page: 1, date: '' });
              }}
            >
              <SelectTrigger
                aria-label='记录状态'
                className='min-w-24 bg-background text-foreground'
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='1'>合格</SelectItem>
                <SelectItem value='0'>未合格</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className='flex items-center gap-2 text-xs text-muted-foreground'>
            <span>日期</span>
            <Select
              value={filter.date || '__all_dates__'}
              disabled={records.loading}
              onValueChange={(date) => {
                void recordsPage({
                  ...filter,
                  date: date === '__all_dates__' ? '' : date,
                });
              }}
            >
              <SelectTrigger
                aria-label='记录日期'
                className='max-w-44 bg-background text-foreground'
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='__all_dates__'>当前页全部日期</SelectItem>
                {Array.from(
                  new Set([
                    filter.date,
                    ...dates.map((date) => text(date.date, '')),
                  ]),
                )
                  .filter(Boolean)
                  .map((date) => (
                    <SelectItem key={date} value={date}>
                      {date}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DataFeedback resource={records} />
        <div className='hidden overflow-x-auto rounded-xl border border-border/60 md:block'>
          <table className='w-full min-w-[590px] text-left text-sm'>
            <caption className='sr-only'>当前账号的运动记录</caption>
            <thead className='bg-muted/50 text-xs text-muted-foreground'>
              <tr>
                {['时间 / 类型', '距离', '时长', '状态', '详情'].map((name) => (
                  <th key={name} scope='col' className='px-4 py-3 font-medium'>
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={text(row.id, String(index))}
                  className='border-t border-border/50'
                >
                  <td className='max-w-64 px-4 py-4'>
                    <p className='truncate font-medium'>
                      {text(row.startTime)}
                    </p>
                    <p className='mt-1 text-xs text-muted-foreground'>
                      {text(
                        row.sportTypeName,
                        `运动类型 ${text(row.sportType)}`,
                      )}
                    </p>
                  </td>
                  <td className='whitespace-nowrap px-4 py-4 font-medium tabular-nums'>
                    {quantity(row.sportRange, 3)} km
                  </td>
                  <td className='whitespace-nowrap px-4 py-4 text-muted-foreground'>
                    {duration(row.sportTime)}
                  </td>
                  <td className='px-4 py-4'>
                    <Badge
                      variant={
                        String(row.status) === '0' ? 'destructive' : 'secondary'
                      }
                    >
                      {recordStatus(row.status)}
                    </Badge>
                  </td>
                  <td className='px-4 py-4'>
                    {typeof row.id === 'string' && row.id ? (
                      <Button asChild variant='ghost' size='icon'>
                        <Link
                          to={`/records/${encodeURIComponent(row.id)}`}
                          aria-label={`查看 ${text(row.startTime)} 的记录详情`}
                        >
                          <ChevronRight className='size-4' aria-hidden='true' />
                        </Link>
                      </Button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className='space-y-3 md:hidden'>
          {rows.map((row, index) => (
            <div
              key={text(row.id, String(index))}
              className='space-y-3 rounded-xl border border-border/60 p-3'
            >
              <div className='flex items-start justify-between gap-2'>
                <div className='min-w-0'>
                  <p className='break-words text-xs font-medium'>
                    {text(row.startTime)}
                  </p>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    {text(row.sportTypeName, `运动类型 ${text(row.sportType)}`)}
                  </p>
                </div>
                <Badge
                  variant={
                    String(row.status) === '0' ? 'destructive' : 'secondary'
                  }
                >
                  {recordStatus(row.status)}
                </Badge>
              </div>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div>
                  <p className='text-lg font-medium tabular-nums'>
                    {quantity(row.sportRange, 3)}{' '}
                    <span className='text-xs text-muted-foreground'>km</span>
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {duration(row.sportTime)}
                  </p>
                </div>
                {typeof row.id === 'string' && row.id && (
                  <Button asChild variant='outline' size='sm'>
                    <Link
                      to={`/records/${encodeURIComponent(row.id)}`}
                      aria-label={`查看 ${text(row.startTime)} 的记录详情`}
                    >
                      详情
                      <ChevronRight className='size-3' aria-hidden='true' />
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        {rows.length === 0 && (
          <p className='py-8 text-center text-sm text-muted-foreground'>
            {records.loading
              ? '正在读取记录…'
              : records.error
                ? '本次读取未获得记录。'
                : records.data === null
                  ? '暂无可用记录数据。'
                  : '当前筛选下没有运动记录。'}
          </p>
        )}
        <div className='flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground'>
          <span>
            第 {filter.page} 组日期 · 当前显示 {rows.length} 条
          </span>
          <div className='flex gap-2'>
            <Button
              variant='outline'
              disabled={records.loading || filter.page <= 1}
              onClick={() => {
                void recordsPage({
                  ...filter,
                  page: filter.page - 1,
                  date: '',
                });
              }}
            >
              <ArrowLeft className='size-3.5' aria-hidden='true' />
              上一组
            </Button>
            <Button
              variant='outline'
              disabled={
                records.loading ||
                filter.page >= 120 ||
                (rows.length === 0 && dates.length === 0)
              }
              onClick={() => {
                void recordsPage({
                  ...filter,
                  page: filter.page + 1,
                  date: '',
                });
              }}
            >
              下一组
              <ArrowRight className='size-3.5' aria-hidden='true' />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
