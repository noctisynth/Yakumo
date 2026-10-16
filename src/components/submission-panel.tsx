import { invoke } from '@tauri-apps/api/core';
import { LoaderCircle, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { Receipt } from '@/components/submission-recovery';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useDashboardAccount } from '@/hooks/use-dashboard-account';
import type { RunPreview } from '@/models/run';
import { useDashboardStore } from '@/stores/dashboard-store';

interface Preparation {
  ticket: string | null;
  blockers: string[];
  notes: string[];
  expiresAt: number;
}
const failure = (e: unknown) =>
  typeof e === 'object' &&
  e !== null &&
  'message' in e &&
  typeof e.message === 'string'
    ? e.message
    : '操作未能完成，请先核对已有提交。';
export function SubmissionPanel({ preview }: { preview: RunPreview | null }) {
  const { active } = useDashboardAccount();
  const accountId = active?.id ?? '';
  const context = `${accountId}:${preview?.digest ?? ''}`;
  const currentContext = useRef(context);
  currentContext.current = context;
  const consentId = useId();
  const [preparation, setPreparation] = useState<Preparation | null>(null);
  const [history, setHistory] = useState<Receipt[]>([]);
  const [lastReceipt, setLastReceipt] = useState<Receipt | null>(null);
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
  const outcome =
    lastReceipt ??
    history.find((r) => r.digest === preview?.digest) ??
    history.find((r) => r.state === 'unknown');
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
      const receipt = await invoke<Receipt>('submit_run', {
        accountId,
        ticket: preparation.ticket,
        consent,
      });
      if (mounted.current) {
        setPreparation(null);
        setLastReceipt(receipt);
        void useDashboardStore.getState().overview();
      }
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
          {(lastReceipt || locked) && (
            <div className='space-y-3 border-t border-border pt-5'>
              <p role='status' className='text-sm font-medium'>
                {outcome?.state === 'accepted'
                  ? '学校已接收'
                  : outcome?.state === 'rejected'
                    ? '学校未接收本次提交'
                    : '有提交结果待核对'}
              </p>
              <p className='text-xs leading-6 text-muted-foreground'>
                {outcome?.message || '请前往运动记录核对结果，避免重复提交。'}
              </p>
              <Button asChild size='sm' variant='outline'>
                <Link to='/records'>查看运动记录</Link>
              </Button>
            </div>
          )}
          {preparation && !locked && (
            <div className='space-y-4 border-t border-border pt-5'>
              <p className='text-sm font-medium'>
                {preparation.ticket ? '学校基础要求检查通过' : '当前无法提交'}
              </p>
              {preparation.blockers.length > 0 && (
                <div className='space-y-3'>
                  <p className='text-xs text-muted-foreground'>
                    本次数据尚未发送。请查看以下原因及处理方式。
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
      {historyError && (
        <Button
          className='mt-3'
          variant='outline'
          size='sm'
          onClick={() => void refresh()}
        >
          重试核对
        </Button>
      )}
    </section>
  );
}
