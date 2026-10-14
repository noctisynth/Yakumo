import { invoke } from '@tauri-apps/api/core';
import { ArrowUpRight, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDashboardAccount } from '@/hooks/use-dashboard-account';
import {
  items,
  object,
  quantity,
  recordStatus,
  text,
} from '@/lib/exercise-data';
import type { RunPreview } from '@/models/run';
import { readExercise } from '@/services/exercise-service';
import { useDashboardStore } from '@/stores/dashboard-store';

interface Preparation {
  ticket: string | null;
  blockers: string[];
  notes: string[];
  expiresAt: number;
}
interface Receipt {
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
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div>
          <p
            className={`text-sm font-medium ${receipt.state === 'unknown' ? 'text-primary' : ''}`}
          >
            {receipt.state === 'accepted'
              ? '学校已接收'
              : receipt.state === 'rejected'
                ? '学校已拒绝'
                : '结果不确定'}
          </p>
          <p className='mt-1 text-[10px] text-muted-foreground'>
            {new Date(receipt.createdAt).toLocaleString()} · {receipt.source} /{' '}
            {receipt.algorithm}
          </p>
        </div>
        <span className='font-mono text-[10px] text-muted-foreground'>
          {receipt.digest.slice(0, 12)}
        </span>
      </div>
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
        <Button asChild size='sm' variant='ghost'>
          <Link to='/records'>查看运动记录</Link>
        </Button>
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
export function SubmissionPanel({ preview }: { preview: RunPreview | null }) {
  const { active } = useDashboardAccount();
  const accountId = active?.id ?? '';
  const [preparation, setPreparation] = useState<Preparation | null>(null),
    [history, setHistory] = useState<Receipt[]>([]),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false),
    [error, setError] = useState<string | null>(null);
  const mounted = useRef(true),
    flight = useRef(false);
  const refreshSequence = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    try {
      const receipts = await invoke<Receipt[]>('submission_history', {
        accountId,
      });
      if (mounted.current && sequence === refreshSequence.current)
        setHistory(receipts);
    } catch (e) {
      if (mounted.current) setError(failure(e));
    }
  }, [accountId]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);
  async function prepare() {
    if (!preview || flight.current) return;
    flight.current = true;
    setBusy(true);
    setError(null);
    setConsent(false);
    setPreparation(null);
    try {
      const result = await invoke<Preparation>('prepare_run', {
        accountId,
        input: preview.input,
      });
      if (mounted.current) setPreparation(result);
    } catch (e) {
      if (mounted.current) setError(failure(e));
    } finally {
      flight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function submit() {
    if (!preparation?.ticket || !consent || flight.current) return;
    flight.current = true;
    setBusy(true);
    setError(null);
    try {
      await invoke<Receipt>('submit_run', {
        accountId,
        ticket: preparation.ticket,
        consent,
      });
      if (mounted.current) setPreparation(null);
    } catch (e) {
      if (mounted.current) {
        setError(failure(e));
        setPreparation(null);
      }
    } finally {
      flight.current = false;
      if (mounted.current) {
        setBusy(false);
        void refresh();
      }
    }
  }
  const locked = history.some(
    (r) => r.state === 'unknown' || r.digest === preview?.digest,
  );
  return (
    <section className='rounded-xl border border-border bg-card p-5'>
      <div className='flex items-center gap-2'>
        <ShieldCheck className='size-4 text-primary' />
        <h2 className='text-sm font-semibold'>03 / 提交与核对</h2>
      </div>
      <p className='mt-3 text-xs leading-6 text-muted-foreground'>
        提交由你明确发起。先读取当前学校要求，未支持或未知的要求会阻止提交；学校可能拒绝合成数据。
      </p>
      {preview && (
        <div className='mt-4 space-y-4'>
          <Button
            variant='outline'
            disabled={busy || locked}
            onClick={() => void prepare()}
          >
            检查学校要求
          </Button>
          {locked && (
            <p className='text-xs text-primary'>
              本草稿已有提交，或账号存在结果不确定的提交。请先核对下方历史。
            </p>
          )}
          {preparation && (
            <div className='space-y-3 rounded-lg bg-muted/60 p-4'>
              <p className='text-xs font-medium'>
                {preparation.ticket
                  ? '基础要求检查通过，请确认提交'
                  : '当前无法提交'}
              </p>
              {preparation.blockers.map((line) => (
                <p key={line} className='text-xs leading-6 text-destructive'>
                  {line}
                </p>
              ))}
              {preparation.notes.map((line) => (
                <p
                  key={line}
                  className='text-xs leading-6 text-muted-foreground'
                >
                  {line}
                </p>
              ))}
              {preparation.ticket && (
                <>
                  <p className='text-[10px] text-muted-foreground'>
                    确认有效至{' '}
                    {new Date(preparation.expiresAt).toLocaleTimeString()}
                    ，过期请重新检查。
                  </p>
                  <label className='flex items-start gap-3 text-xs leading-6'>
                    <input
                      type='checkbox'
                      checked={consent}
                      disabled={busy}
                      onChange={(e) => setConsent(e.target.checked)}
                      className='mt-1.5 accent-current'
                    />
                    我确认发送当前账号的合成运动数据，知晓 HTTP
                    明文传输及结果不确定时不可盲目重传。
                  </label>
                  <Button
                    disabled={!consent || busy}
                    onClick={() => void submit()}
                  >
                    <Send className='size-3.5' />
                    {busy ? '正在提交…' : '确认提交一次'}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}
      {error && (
        <p role='alert' className='mt-4 text-xs leading-6 text-destructive'>
          {error}
        </p>
      )}
      <div className='mt-6 flex items-center justify-between border-t border-border pt-4'>
        <h3 className='text-xs font-medium'>本账号提交历史</h3>
        <Button
          variant='ghost'
          size='sm'
          disabled={busy}
          onClick={() => void refresh()}
        >
          刷新回执
        </Button>
      </div>
      {history.length ? (
        history.map((receipt) => (
          <ReceiptCard
            key={receipt.id}
            receipt={receipt}
            accountId={accountId}
            onLinked={() => void refresh()}
          />
        ))
      ) : (
        <p className='py-5 text-xs text-muted-foreground'>
          暂无本地提交记录。提交意图与回执加密保存，含合成来源，不保存轨迹坐标。
        </p>
      )}
    </section>
  );
}
