import { invoke } from '@tauri-apps/api/core';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  items,
  object,
  quantity,
  recordStatus,
  text,
} from '@/lib/exercise-data';
import { readExercise } from '@/services/exercise-service';
import { useDashboardStore } from '@/stores/dashboard-store';
export interface Receipt {
  id: string;
  digest: string;
  identify: string;
  state: string;
  message: string;
  recordId: string | null;
  createdAt: number;
  algorithm: string;
  source: string;
}
const failure = (e: unknown) =>
  typeof e === 'object' &&
  e !== null &&
  'message' in e &&
  typeof e.message === 'string'
    ? e.message
    : '操作未能完成，请先核对已有提交。';
function ReceiptCard({
  receipt,
  accountId,
  onLinked,
}: {
  receipt: Receipt;
  accountId: string;
  onLinked: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [report, setReport] = useState<string[]>([]),
    [recordId, setRecordId] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function reconcile() {
    setBusy(true);
    setReport([]);
    const results = await Promise.allSettled([
      receipt.recordId
        ? readExercise(accountId, { kind: 'detail', id: receipt.recordId })
        : Promise.resolve(null),
      readExercise(accountId, {
        kind: 'records',
        status: '1',
        page: 1,
        date: '',
      }),
      readExercise(accountId, { kind: 'statistics' }),
      readExercise(accountId, { kind: 'summary' }),
    ]);
    if (!mounted.current) return;
    const labels = ['详情', '有效列表当前日期页', '统计快照', '运动汇总'];
    const lines = results.map((r, i) => {
      if (r.status === 'rejected') return `${labels[i]}：${failure(r.reason)}`;
      if (!r.value) return '详情：回执没有记录标识，请查看列表后尝试关联核对。';
      const data = object(r.value.data);
      if (i === 0)
        return `详情：${recordStatus(data.status)} · ${text(data.remark)}`;
      if (i === 1)
        return receipt.recordId
          ? `有效列表当前日期页：${items(data.records).some((v) => text(object(v).id, '') === receipt.recordId) ? '已收录' : '本页未见，可能存在延迟或其他日期分组'}`
          : '有效列表已读取，请到运动记录页查看候选记录。';
      if (i === 2)
        return `最新累计里程 ${quantity(data.allTotalMileage)} km，累计次数 ${quantity(data.allNum, 0)}；不据此推断本次增量。`;
      return '运动汇总已读取；接收、详情判定及统计口径分别核对。';
    });
    setReport(lines);
    setBusy(false);
    void useDashboardStore.getState().overview();
  }
  async function link() {
    setBusy(true);
    try {
      await invoke<Receipt>('link_submission', {
        accountId,
        attemptId: receipt.id,
        recordId: recordId.trim(),
      });
      if (mounted.current) {
        setReport(['已用学校详情的运动关联标识确认入库。']);
        onLinked();
      }
    } catch (e) {
      if (mounted.current) setReport([failure(e)]);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <article className='space-y-4 border-t border-border py-5'>
      <p className='text-sm font-medium'>提交结果待核对</p>
      <p className='mt-1 text-xs text-muted-foreground'>
        {new Date(receipt.createdAt).toLocaleString()}
      </p>
      <p className='text-xs leading-6 text-muted-foreground'>
        {receipt.message}
      </p>
      <div className='flex flex-wrap gap-2'>
        <Button
          size='sm'
          variant='outline'
          disabled={busy}
          onClick={() => void reconcile()}
        >
          <RefreshCw className='size-3.5' />
          核对详情、列表与统计
        </Button>
        {receipt.recordId && (
          <Button asChild size='sm' variant='ghost'>
            <Link to={`/records/${encodeURIComponent(receipt.recordId)}`}>
              打开详情
              <ArrowUpRight className='size-3.5' />
            </Link>
          </Button>
        )}
      </div>
      {!receipt.recordId && (
        <details className='text-xs'>
          <summary className='cursor-pointer text-muted-foreground'>
            用学校记录标识关联核对
          </summary>
          <p className='my-3 leading-6 text-muted-foreground'>
            只有详情中的运动关联标识匹配，才会更新本地回执；无法匹配时保留结果不确定。
          </p>
          <div className='flex flex-wrap gap-2'>
            <Input
              aria-label='学校记录标识'
              maxLength={128}
              value={recordId}
              onChange={(e) => setRecordId(e.target.value)}
              className='min-w-0 flex-1'
            />
            <Button
              size='sm'
              disabled={busy || !recordId.trim()}
              onClick={() => void link()}
            >
              关联核对
            </Button>
          </div>
        </details>
      )}
      {report.length > 0 && (
        <ul
          role='status'
          className='space-y-2 rounded-md bg-muted p-4 text-xs leading-6 text-muted-foreground'
        >
          {report.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </article>
  );
}
export function SubmissionRecovery({ accountId }: { accountId: string }) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const history = await invoke<Receipt[]>('submission_history', {
        accountId,
      });
      if (request === sequence.current) {
        setReceipts(history.filter((r) => r.state === 'unknown'));
        setError(null);
      }
    } catch (e) {
      if (request === sequence.current) setError(failure(e));
    }
  }, [accountId]);
  useEffect(() => {
    void refresh();
    return () => {
      sequence.current++;
    };
  }, [refresh]);
  if (!receipts.length && !error) return null;
  return (
    <section
      className='rounded-xl border border-primary/30 bg-card p-5'
      aria-label='待核对提交'
    >
      <div className='flex items-center justify-between gap-3'>
        <h2 className='text-sm font-semibold'>待核对提交</h2>
        <Button size='sm' variant='ghost' onClick={() => void refresh()}>
          <RefreshCw className='size-3.5' />
          刷新状态
        </Button>
      </div>
      <p className='mt-2 text-xs leading-6 text-muted-foreground'>
        {receipts.length
          ? '以下提交尚未确认结果，核对完成前将暂停再次提交。'
          : '暂时无法读取待核对状态，学校运动记录仍可正常查看。'}
      </p>
      {error && (
        <p role='alert' className='mt-3 text-sm text-destructive'>
          {error}
        </p>
      )}
      {receipts.map((receipt) => (
        <ReceiptCard
          key={receipt.id}
          receipt={receipt}
          accountId={accountId}
          onLinked={() => void refresh()}
        />
      ))}
    </section>
  );
}
