import { invoke } from '@tauri-apps/api/core';
import {
  ArrowUpRight,
  LoaderCircle,
  RefreshCw,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  const context = `${accountId}:${preview?.digest ?? ''}`;
  const currentContext = useRef(context);
  currentContext.current = context;
  const consentId = useId();
  const [preparation, setPreparation] = useState<Preparation | null>(null);
  const [history, setHistory] = useState<Receipt[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const mounted = useRef(true),
    flight = useRef(false);
  const refreshSequence = useRef(0),
    preparationSequence = useRef(0);
  const autoChecked = useRef<string | null>(null);
  const busy = checking || submitting;
  const locked = history.some(
    (r) => r.state === 'unknown' || r.digest === preview?.digest,
  );
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    try {
      const receipts = await invoke<Receipt[]>('submission_history', {
        accountId,
      });
      if (mounted.current && sequence === refreshSequence.current) {
        setHistory(receipts);
        setHistoryReady(true);
        setHistoryError(null);
      }
    } catch (e) {
      if (mounted.current && sequence === refreshSequence.current) {
        setHistoryError(failure(e));
        setHistoryReady(false);
        setPreparation(null);
        setConsent(false);
        autoChecked.current = null;
      }
    }
  }, [accountId]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
      refreshSequence.current++;
      preparationSequence.current++;
    };
  }, [refresh]);
  const prepare = useCallback(async () => {
    if (!preview || flight.current || !historyReady || locked) return;
    flight.current = true;
    const sequence = ++preparationSequence.current;
    setChecking(true);
    setError(null);
    setConsent(false);
    setPreparation(null);
    try {
      const result = await invoke<Preparation>('prepare_run', {
        accountId,
        input: preview.input,
      });
      if (result.ticket && result.expiresAt <= Date.now())
        throw new Error('检查结果已过期，请重试。');
      if (
        mounted.current &&
        sequence === preparationSequence.current &&
        currentContext.current === context
      )
        setPreparation(result);
    } catch (e) {
      if (
        mounted.current &&
        sequence === preparationSequence.current &&
        currentContext.current === context
      )
        setError(failure(e));
    } finally {
      flight.current = false;
      if (mounted.current) setChecking(false);
    }
  }, [accountId, context, historyReady, locked, preview]);
  useEffect(() => {
    if (
      !preview ||
      !historyReady ||
      locked ||
      busy ||
      autoChecked.current === context
    )
      return;
    autoChecked.current = context;
    void prepare();
  }, [busy, context, historyReady, locked, prepare, preview]);
  useEffect(() => {
    if (!preparation?.ticket || locked) return;
    const timer = setTimeout(
      () => {
        if (flight.current) return;
        setConsent(false);
        setPreparation(null);
        void prepare();
      },
      Math.max(0, preparation.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [locked, preparation, prepare]);
  async function submit() {
    if (
      !preparation?.ticket ||
      !consent ||
      flight.current ||
      locked ||
      !historyReady
    )
      return;
    if (preparation.expiresAt <= Date.now()) {
      void prepare();
      return;
    }
    flight.current = true;
    setSubmitting(true);
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
        setSubmitting(false);
        setConsent(false);
        void refresh();
      }
    }
  }
  return (
    <section className='rounded-xl border border-border bg-card p-5'>
      <div className='flex items-center justify-between gap-3'>
        <h2 className='flex items-center gap-2 text-sm font-semibold'>
          <ShieldCheck className='size-4 text-primary' />
          提交核对
        </h2>
        {historyReady && !locked && (preparation || error) && (
          <Button
            variant='ghost'
            size='sm'
            disabled={busy}
            onClick={() => void prepare()}
          >
            <RefreshCw className='size-3.5' />
            重新检查
          </Button>
        )}
      </div>
      {preview && (
        <div className='mt-5 space-y-5'>
          <div className='overflow-hidden rounded-xl border border-border'>
            <table className='w-full text-sm'>
              <caption className='sr-only'>本次提交数据</caption>
              <tbody className='divide-y divide-border'>
                {[
                  [
                    '距离',
                    `${(preview.actualDistanceM / 1000).toFixed(4)} 公里`,
                  ],
                  [
                    '时长',
                    `${Math.floor(preview.input.durationS / 60)} 分 ${preview.input.durationS % 60} 秒`,
                  ],
                  ['步数', `${preview.input.steps.toLocaleString()} 步`],
                  ['配速', `${preview.pace} / 公里`],
                  [
                    '开始时间',
                    new Date(preview.input.startTime).toLocaleString(),
                  ],
                  ['结束时间', new Date(preview.endTime).toLocaleString()],
                  [
                    '数据来源',
                    preview.source === 'synthetic'
                      ? '合成数据'
                      : preview.source,
                  ],
                ].map(([label, value]) => (
                  <tr key={label}>
                    <th
                      scope='row'
                      className='w-24 px-4 py-3 text-left text-xs font-normal text-muted-foreground sm:w-32'
                    >
                      {label}
                    </th>
                    <td className='px-4 py-3 text-right text-xs tabular-nums sm:text-sm'>
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!historyReady && !historyError && (
            <p
              role='status'
              className='flex items-center gap-2 text-sm text-muted-foreground'
            >
              <LoaderCircle className='size-4 animate-spin' />
              正在核对提交记录…
            </p>
          )}
          {checking && (
            <p
              role='status'
              className='flex items-center gap-2 text-sm text-muted-foreground'
            >
              <LoaderCircle className='size-4 animate-spin' />
              正在检查学校要求…
            </p>
          )}
          {locked && (
            <p className='text-sm leading-6 text-primary'>
              本草稿已有提交，或账号存在结果不确定的提交。请先核对下方历史。
            </p>
          )}
          {preparation && !locked && (
            <div className='space-y-4 border-t border-border pt-5'>
              <p className='text-sm font-medium'>
                {preparation.ticket ? '学校基础要求检查通过' : '当前无法提交'}
              </p>
              {preparation.blockers.length > 0 && (
                <div className='space-y-3'>
                  <p className='text-xs text-muted-foreground'>
                    本次尚未发送，请调整以下项目后重新生成。
                  </p>
                  <ul className='space-y-2' aria-label='提交拦截原因'>
                    {preparation.blockers.map((line) => (
                      <li
                        key={line}
                        className='rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm leading-6 text-destructive'
                      >
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {preparation.notes.length > 0 && (
                <details className='text-xs text-muted-foreground'>
                  <summary className='cursor-pointer py-1'>提交说明</summary>
                  <ul className='mt-2 space-y-1 leading-6'>
                    {preparation.notes.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </details>
              )}
              {preparation.ticket && (
                <>
                  <p className='text-[10px] text-muted-foreground'>
                    检查有效至{' '}
                    {new Date(preparation.expiresAt).toLocaleTimeString()}
                    ，过期自动更新。
                  </p>
                  <label
                    htmlFor={consentId}
                    className='flex items-start gap-3 text-xs leading-6'
                  >
                    <Checkbox
                      id={consentId}
                      checked={consent}
                      disabled={busy}
                      onCheckedChange={(value) => setConsent(value === true)}
                      className='mt-1'
                    />
                    我确认向学校提交当前账号的合成运动数据，知晓连接未加密，结果不确定时先核对再重试。
                  </label>
                  <Button
                    disabled={!consent || busy || !historyReady}
                    onClick={() => void submit()}
                  >
                    <Send className='size-3.5' />
                    {submitting ? '正在提交…' : '确认提交一次'}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}
      {error && (
        <p role='alert' className='mt-4 text-sm leading-6 text-destructive'>
          {error}
        </p>
      )}
      {historyError && (
        <p role='alert' className='mt-4 text-sm leading-6 text-destructive'>
          提交记录未能核对：{historyError}
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
