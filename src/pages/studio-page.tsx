import { invoke, isTauri } from '@tauri-apps/api/core';
import { Download, WandSparkles } from 'lucide-react';
import { useState } from 'react';
import { AccountRequired } from '@/components/account-required';
import { SubmissionPanel } from '@/components/submission-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDashboardAccount } from '@/hooks/use-dashboard-account';
import type { RunPreview } from '@/models/run';
import { useStudioStore } from '@/stores/studio-store';

const fields = [
  ['latitude', '中心纬度', '-85', '85'],
  ['longitude', '中心经度', '-179', '179'],
  ['distanceM', '距离 / 米', '100', '30000'],
  ['durationS', '有效时长 / 秒', '60', '7200'],
  ['steps', '总步数', '1', '50000'],
  ['laps', '圈数', '1', '10'],
] as const;
function RoutePreview({ preview }: { preview: RunPreview }) {
  const points = preview.points;
  const minA = Math.min(...points.map((p) => p.a)),
    maxA = Math.max(...points.map((p) => p.a));
  const minO = Math.min(...points.map((p) => p.o)),
    maxO = Math.max(...points.map((p) => p.o));
  const line = points
    .filter(
      (_, i) =>
        i % Math.max(1, Math.floor(points.length / 500)) === 0 ||
        i === points.length - 1,
    )
    .map(
      (p) =>
        `${30 + ((p.o - minO) / Math.max(1e-9, maxO - minO)) * 340},${230 - ((p.a - minA) / Math.max(1e-9, maxA - minA)) * 200}`,
    )
    .join(' ');
  return (
    <svg
      viewBox='0 0 400 260'
      className='w-full'
      role='img'
      aria-label='合成闭环轨迹示意，非真实地图'
    >
      <title>合成闭环轨迹示意，未匹配道路</title>
      <path
        d='M0 65H400 M0 130H400 M0 195H400 M100 0V260 M200 0V260 M300 0V260'
        className='stroke-border'
        fill='none'
      />
      <polyline
        points={line}
        fill='none'
        className='stroke-primary'
        strokeWidth='2'
      />
      <circle
        cx={line.split(' ')[0]?.split(',')[0]}
        cy={line.split(' ')[0]?.split(',')[1]}
        r='5'
        className='fill-primary'
      />
    </svg>
  );
}
function StudioContent() {
  const studio = useStudioStore();
  const [values, setValues] = useState(() => {
    const input = studio.preview?.input;
    return {
      latitude: input ? String(input.latitude) : '',
      longitude: input ? String(input.longitude) : '',
      distanceM: String(input?.distanceM ?? 2000),
      durationS: String(input?.durationS ?? 900),
      steps: String(input?.steps ?? 2400),
      laps: String(input?.laps ?? 5),
      seed: input?.seed ?? 'yakumo-1',
      start: new Date(input?.startTime ?? Date.now() - 900000)
        .toISOString()
        .slice(0, 19),
    };
  });
  const preview = studio.preview;
  async function exportPreview() {
    if (!preview) return;
    try {
      if (isTauri() && (await invoke<boolean>('mobile_platform'))) {
        await invoke('export_mobile_preview', { input: preview.input });
        return;
      }
    } catch {
      useStudioStore.setState({ error: '无法保存预览，请重试。' });
      return;
    }

    const url = URL.createObjectURL(
      new Blob([JSON.stringify(preview, null, 2)], {
        type: 'application/json',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `yakumo-synthetic-${preview.digest.slice(0, 12)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className='space-y-7'>
      <header>
        <p className='text-[10px] tracking-[0.25em] text-muted-foreground'>
          STUDIO / SYNTHETIC RUN
        </p>
        <h1 className='mt-3 text-3xl font-semibold'>让每个参数，都有依据。</h1>
        <p className='mt-3 text-sm text-muted-foreground'>
          输入参数 → 生成轨迹 → 检查预览 → 明确确认后提交。
        </p>
      </header>
      <div className='grid items-start gap-6 xl:grid-cols-[340px_1fr]'>
        <form
          className='space-y-5 rounded-xl border border-border bg-card p-5'
          onSubmit={(e) => {
            e.preventDefault();
            void studio.generate({
              seed: values.seed,
              startTime: Date.parse(`${values.start}Z`),
              latitude: Number(values.latitude),
              longitude: Number(values.longitude),
              distanceM: Number(values.distanceM),
              durationS: Number(values.durationS),
              steps: Number(values.steps),
              laps: Number(values.laps),
            });
          }}
        >
          <h2 className='text-sm font-semibold'>01 / 参数</h2>
          <div className='grid grid-cols-2 gap-4'>
            {fields.map(([key, label, min, max]) => (
              <div key={key} className='space-y-2'>
                <Label htmlFor={`run-${key}`}>{label}</Label>
                <Input
                  id={`run-${key}`}
                  required
                  type='number'
                  min={min}
                  max={max}
                  step={key === 'latitude' || key === 'longitude' ? 'any' : '1'}
                  value={values[key]}
                  onChange={(e) => {
                    studio.clear();
                    setValues({ ...values, [key]: e.target.value });
                  }}
                  disabled={studio.busy}
                />
              </div>
            ))}
          </div>
          <div className='space-y-2'>
            <Label htmlFor='run-seed'>随机种子</Label>
            <Input
              id='run-seed'
              value={values.seed}
              required
              maxLength={128}
              onChange={(e) => {
                studio.clear();
                setValues({ ...values, seed: e.target.value });
              }}
              disabled={studio.busy}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='run-start'>起始时间 / UTC</Label>
            <Input
              id='run-start'
              type='datetime-local'
              required
              step='1'
              value={values.start}
              onChange={(e) => {
                studio.clear();
                setValues({ ...values, start: e.target.value });
              }}
              disabled={studio.busy}
            />
          </div>
          <p className='text-xs leading-6 text-muted-foreground'>
            相同参数和种子产生相同结果。坐标由你输入，路线不代表真实采集或道路。
          </p>
          <Button type='submit' disabled={studio.busy} className='w-full'>
            <WandSparkles className='size-4' />
            {studio.busy ? '正在生成…' : '生成并检查'}
          </Button>
          {studio.error && (
            <p role='alert' className='text-sm text-destructive'>
              {studio.error}
            </p>
          )}
        </form>
        <section className='min-w-0 space-y-5'>
          {preview ? (
            <>
              <div className='overflow-hidden rounded-xl border border-border bg-card'>
                <div className='flex items-center justify-between gap-2 border-b border-border p-5'>
                  <h2 className='text-sm font-semibold'>02 / 合成预览</h2>
                  <Button size='sm' variant='outline' onClick={exportPreview}>
                    <Download className='size-3.5' />
                    导出预览
                  </Button>
                </div>
                <div className='grid grid-cols-2 gap-5 p-5 sm:grid-cols-4'>
                  {[
                    [
                      '距离',
                      `${(preview.actualDistanceM / 1000).toFixed(3)} km`,
                    ],
                    ['时长', `${preview.input.durationS} 秒`],
                    ['配速', preview.pace],
                    ['平均速度', `${preview.averageKmh.toFixed(2)} km/h`],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className='text-xs text-muted-foreground'>{label}</p>
                      <p className='mt-2 text-lg font-medium tabular-nums'>
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
                <div className='px-5'>
                  <RoutePreview preview={preview} />
                </div>
                <p className='px-5 pb-5 text-[11px] text-muted-foreground'>
                  轨迹为示意比例，不是地图 · {preview.points.length} 个点 ·{' '}
                  {preview.input.steps} 步
                </p>
              </div>
              <div className='rounded-xl border border-border bg-card p-5'>
                <h2 className='text-sm font-semibold'>一致性检查</h2>
                <ul className='mt-4 space-y-2 text-xs text-muted-foreground'>
                  {preview.checks.map((check) => (
                    <li key={check}>✓ {check}</li>
                  ))}
                </ul>
                <p className='mt-4 break-all border-t border-border pt-4 text-[10px] leading-5 text-muted-foreground'>
                  来源 {preview.source} · 算法 {preview.algorithm}
                  <br />
                  SHA-256 {preview.digest}
                </p>
                <p className='mt-3 text-xs text-primary'>
                  本地一致性通过，不代表学校判定合格。
                </p>
              </div>
              <details className='rounded-xl border border-border p-5 text-xs'>
                <summary className='cursor-pointer'>
                  分钟步数增量 · {preview.stepBuckets.length} 桶
                </summary>
                <p className='mt-3 break-words leading-6 text-muted-foreground'>
                  {preview.stepBuckets.join(' / ')}
                </p>
              </details>
            </>
          ) : (
            <div className='flex min-h-96 flex-col items-center justify-center rounded-xl border border-dashed border-border p-8 text-center'>
              <WandSparkles className='mb-5 size-8 text-primary/60' />
              <h2 className='text-lg font-medium'>从一组参数开始</h2>
              <p className='mt-3 max-w-xs text-xs leading-6 text-muted-foreground'>
                生成后在这里查看轨迹、配速和一致性报告。数据只在本次会话保留，导出由你手动发起。
              </p>
            </div>
          )}
          <SubmissionPanel key={preview?.digest ?? 'empty'} preview={preview} />
        </section>
      </div>
    </div>
  );
}
export function StudioPage() {
  const { active, ready } = useDashboardAccount();
  if (!ready) return <AccountRequired />;
  return <StudioContent key={active?.id} />;
}
