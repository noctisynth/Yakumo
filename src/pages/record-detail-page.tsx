import { RefreshCw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useParams } from 'react-router';
import { DataFeedback } from '@/components/data-feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDashboardAccount } from '@/hooks/use-dashboard-account';
import {
  duration,
  items,
  object,
  quantity,
  recordStatus,
  text,
} from '@/lib/exercise-data';
import { useDashboardStore } from '@/stores/dashboard-store';

export function RecordDetailPage() {
  const { recordId } = useParams();
  const { active, ready } = useDashboardAccount();
  const state = useDashboardStore();
  const requested = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !recordId) {
      requested.current = null;
      return;
    }
    const key = `${active?.id}:${recordId}`;
    if (requested.current === key) return;
    requested.current = key;
    void useDashboardStore
      .getState()
      .read('detail', { kind: 'detail', id: recordId });
  }, [ready, recordId, active?.id]);
  const visible = ready && state.detailId === recordId;
  const detail = object(visible ? state.detail.data : null);
  const metrics = [
    ['距离', `${quantity(detail.sportRange, 3)} km`],
    ['时长', duration(detail.sportTime)],
    ['步数', quantity(detail.step, 0)],
    ['配速', text(detail.speed)],
    ['平均速度', `${quantity(detail.avgspeed)} km/h`],
    [
      '轨迹点数',
      Array.isArray(detail.gitudeLatitude)
        ? String(items(detail.gitudeLatitude).length)
        : '—',
    ],
  ];
  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <p className='mb-2 text-xs text-muted-foreground'>
            {active?.username ?? '未选择账号'}
          </p>
          <h1 className='text-3xl font-semibold'>运动记录详情</h1>
          <p className='mt-3 text-sm text-muted-foreground'>
            {text(detail.startTime)}
          </p>
        </div>
        <Button
          variant='outline'
          disabled={!ready || state.detail.loading || !recordId}
          onClick={() => {
            if (recordId)
              void state.read('detail', { kind: 'detail', id: recordId });
          }}
        >
          <RefreshCw className='size-4' aria-hidden='true' />
          重新读取
        </Button>
      </div>
      {!ready ? (
        <p role='status' className='rounded-xl bg-muted p-5 text-sm'>
          请先选择有效账号。切换账号后会重新读取对应身份下的记录。
        </p>
      ) : (
        visible && <DataFeedback resource={state.detail} />
      )}
      <Card className='rounded-2xl shadow-none'>
        <CardHeader>
          <div className='flex items-center gap-3'>
            <CardTitle className='text-lg'>学校判定</CardTitle>
            <Badge
              variant={
                String(detail.status) === '0' ? 'destructive' : 'secondary'
              }
            >
              {recordStatus(detail.status)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          <p className='break-words text-sm leading-7'>
            {text(detail.remark, '学校未返回判定说明。')}
          </p>
          {detail.remarkExp && (
            <p className='break-words text-xs leading-6 text-muted-foreground'>
              {text(detail.remarkExp)}
            </p>
          )}
          <p className='text-xs text-muted-foreground'>
            详情状态、列表收录和统计计入分别核对，读取成功不等于记录合格。
          </p>
        </CardContent>
      </Card>
      <dl className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        {metrics.map(([label, value]) => (
          <div
            key={label}
            className='rounded-xl border border-border/70 bg-card p-5'
          >
            <dt className='text-xs text-muted-foreground'>{label}</dt>
            <dd className='mt-3 text-xl font-medium tabular-nums'>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
