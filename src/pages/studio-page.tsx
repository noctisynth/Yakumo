import { defineStepper } from '@stepperize/react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  Save,
  WandSparkles,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { AccountRequired } from '@/components/account-required';
import { RunPreviewCard } from '@/components/run-preview-card';
import { StudioMap } from '@/components/studio-map';
import { SubmissionPanel } from '@/components/submission-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useDashboardAccount } from '@/hooks/use-dashboard-account';
import { localDateTime, sampleRun } from '@/lib/studio-sampling';
import { cn } from '@/lib/utils';
import type { OffsetKey, StudioConfig } from '@/models/studio';
import { defaultConfig } from '@/models/studio';
import { editPresets, presetError } from '@/services/preset-service';
import { useStudioDraftStore } from '@/stores/studio-draft-store';
import { useStudioStore } from '@/stores/studio-store';

const steps = [
  { id: 'location', title: '地图选点' },
  { id: 'parameters', title: '基准与偏移' },
  { id: 'preview', title: '检查预览' },
  { id: 'confirm', title: '确认提交' },
] as const;
const flow = defineStepper(steps);
const controls = [
  ['distanceM', '距离', '米', 1000, 0.1],
  ['durationS', '时长', '秒', 600, 1],
  ['steps', '步数', '步', 2000, 1],
  ['laps', '圈数', '圈', 3, 1],
] as const;
function OffsetControl({
  field,
  label,
  unit,
  max,
  step = 1,
  config,
  update,
  disabled,
}: {
  field: OffsetKey;
  label: string;
  unit: string;
  max: number;
  step?: number;
  config: StudioConfig;
  update: (config: StudioConfig) => void;
  disabled: boolean;
}) {
  const range = config.offsets[field];
  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-3 text-xs'>
        <span className='text-muted-foreground'>{label}</span>
        <output className='tabular-nums'>
          {range[0] > 0 ? '+' : ''}
          {range[0]} 至 {range[1] > 0 ? '+' : ''}
          {range[1]} {unit}
        </output>
      </div>
      <Slider
        aria-label={`${label}范围`}
        disabled={disabled}
        min={-max}
        max={max}
        step={step}
        value={range}
        onValueChange={(value) =>
          update({
            ...config,
            offsets: { ...config.offsets, [field]: [value[0], value[1]] },
          })
        }
      />
      <div className='flex justify-between text-[10px] text-muted-foreground'>
        <span>
          −{max} {unit}
        </span>
        <span>0</span>
        <span>
          +{max} {unit}
        </span>
      </div>
    </div>
  );
}
function StudioContent({ accountId }: { accountId: string }) {
  const studio = useStudioStore();
  const stepper = flow.useStepper();
  useEffect(() => {
    document
      .querySelector<HTMLButtonElement>(`#studio-step-${stepper.current.id}`)
      ?.focus();
  }, [stepper.current.id]);
  const [config, setConfig] = useState(() => {
    const draft = useStudioDraftStore.getState();
    return draft.accountId === accountId && draft.config
      ? structuredClone(draft.config)
      : defaultConfig();
  });
  const [mapEnabled, setMapEnabled] = useState(false);
  const [start, setStart] = useState(() =>
    localDateTime(Date.now() - 20 * 60000),
  );
  const [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null),
    [name, setName] = useState(''),
    [saving, setSaving] = useState(false),
    [saveOpen, setSaveOpen] = useState(false);
  const generating = useRef(false),
    saveLock = useRef(false);
  const preview = studio.preview;
  const update = (next: StudioConfig) => {
    setConfig(next);
    useStudioDraftStore.getState().set(accountId, next);
    setNotice(null);
    setError(null);
  };
  async function generate() {
    if (generating.current) return;
    generating.current = true;
    setError(null);
    try {
      const input = sampleRun(
        config,
        new Date(start).getTime(),
        crypto.randomUUID(),
      );
      await studio.generate(input);
      if (
        useStudioStore.getState().accountId === accountId &&
        useStudioStore.getState().preview
      )
        await stepper.goTo('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : '参数无效，请检查后重试。');
    } finally {
      generating.current = false;
    }
  }
  async function save() {
    if (saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setError(null);
    try {
      sampleRun(
        {
          ...config,
          offsets: {
            distanceM: [0, 0],
            durationS: [0, 0],
            steps: [0, 0],
            laps: [0, 0],
            positionM: [0, 0],
            startMinutes: [0, 0],
          },
        },
        new Date(start).getTime(),
        'validation',
      );
      await editPresets(accountId, { kind: 'save', name, config });
      setNotice('预设已加密保存，可在预设列表中使用。');
      setSaveOpen(false);
      setName('');
    } catch (e) {
      setError(presetError(e));
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }
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
      <header className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-[10px] tracking-[0.25em] text-muted-foreground'>
            STUDIO / CREATE AT YOUR PACE
          </p>
          <h1 className='mt-3 text-3xl font-semibold'>
            从选点，到清晰的预览。
          </h1>
          <p className='mt-3 text-sm text-muted-foreground'>
            选好位置与范围，每次生成前都由你确认。
          </p>
        </div>
        <Button asChild variant='outline'>
          <Link to='/studio/presets'>
            <Bookmark className='size-4' />
            预设列表
          </Link>
        </Button>
      </header>
      <nav
        id='studio-steps'
        aria-label='生成步骤'
        className='grid grid-cols-4 gap-2 rounded-xl border border-border bg-card p-3 sm:p-5'
      >
        {steps.map((s, i) => (
          <button
            key={s.id}
            id={`studio-step-${s.id}`}
            type='button'
            disabled={i > stepper.index || studio.busy}
            aria-current={s.id === stepper.current.id ? 'step' : undefined}
            onClick={() => void stepper.goTo(s.id)}
            className={cn(
              'flex min-h-12 flex-col items-center justify-center gap-2 rounded-lg px-1 py-3 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default sm:flex-row sm:gap-3 sm:text-sm',
              i === stepper.index
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs',
                i === stepper.index ? 'border-primary' : 'border-border',
              )}
            >
              {i < stepper.index ? <Check className='size-3' /> : i + 1}
            </span>
            {s.title}
          </button>
        ))}
      </nav>
      {(error || studio.error) && (
        <p
          role='alert'
          className='rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive'
        >
          {error || studio.error}
        </p>
      )}
      {notice && (
        <p role='status' className='rounded-xl bg-accent p-4 text-sm'>
          {notice}
        </p>
      )}
      {stepper.current.id === 'location' && (
        <section className='space-y-5 rounded-xl border border-border bg-card p-5 sm:p-7'>
          <div>
            <h2 className='text-lg font-semibold'>先选一个运动中心</h2>
            <p className='mt-2 text-xs leading-6 text-muted-foreground'>
              点击地图选点，也可手动填写坐标。地图不会自动获取设备位置。
            </p>
          </div>
          <StudioMap
            defaultLoaded={mapEnabled}
            onLoad={() => setMapEnabled(true)}
            latitude={config.latitude}
            longitude={config.longitude}
            onPick={(latitude, longitude) =>
              update({ ...config, latitude, longitude })
            }
          />
          <div className='grid grid-cols-2 gap-4'>
            {(['latitude', 'longitude'] as const).map((key, i) => (
              <div key={key} className='space-y-2'>
                <Label htmlFor={`run-${key}`}>
                  {i === 0 ? '中心纬度' : '中心经度'}
                </Label>
                <Input
                  id={`run-${key}`}
                  type='number'
                  step='any'
                  min={i === 0 ? -85 : -179}
                  max={i === 0 ? 85 : 179}
                  value={config[key] ?? ''}
                  onChange={(e) =>
                    update({
                      ...config,
                      [key]:
                        e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
            ))}
          </div>
          <div className='flex justify-end'>
            <Button
              disabled={
                config.latitude === null ||
                config.longitude === null ||
                !Number.isFinite(config.latitude) ||
                !Number.isFinite(config.longitude) ||
                Math.abs(config.latitude) > 85 ||
                Math.abs(config.longitude) > 179
              }
              onClick={() => void stepper.next()}
            >
              下一步：设置参数
              <ArrowRight className='size-4' />
            </Button>
          </div>
        </section>
      )}
      {stepper.current.id === 'parameters' && (
        <form
          className='space-y-6 rounded-xl border border-border bg-card p-5 sm:p-7'
          onSubmit={(e) => {
            e.preventDefault();
            void generate();
          }}
        >
          <div>
            <h2 className='text-lg font-semibold'>基准值与偏移范围</h2>
            <p className='mt-2 text-xs leading-6 text-muted-foreground'>
              拖动两端设置相对基准的最小、最大偏移，0
              表示不偏移。速度和配速由最终距离与时长计算。
            </p>
          </div>
          <div className='grid gap-5 md:grid-cols-2'>
            {controls.map(([key, label, unit, max, step]) => (
              <div
                key={key}
                className='space-y-5 rounded-xl border border-border p-4'
              >
                <div className='space-y-2'>
                  <Label htmlFor={`run-${key}`}>
                    {label} / {unit}
                  </Label>
                  <Input
                    id={`run-${key}`}
                    type='number'
                    step={step}
                    min={
                      key === 'distanceM' ? 100 : key === 'durationS' ? 60 : 1
                    }
                    max={
                      key === 'distanceM'
                        ? 30000
                        : key === 'durationS'
                          ? 7200
                          : key === 'steps'
                            ? 50000
                            : 10
                    }
                    required
                    value={Number.isFinite(config[key]) ? config[key] : ''}
                    disabled={studio.busy || saving}
                    onChange={(e) =>
                      update({
                        ...config,
                        [key]:
                          e.target.value === '' ? NaN : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <OffsetControl
                  field={key}
                  label={`${label}偏移`}
                  unit={unit}
                  max={max}
                  step={step}
                  config={config}
                  update={update}
                  disabled={studio.busy || saving}
                />
              </div>
            ))}
          </div>
          <div className='grid gap-6 md:grid-cols-2'>
            <OffsetControl
              field='positionM'
              label='中心位置偏移（南北 / 东西）'
              unit='米'
              max={100}
              config={config}
              update={update}
              disabled={studio.busy || saving}
            />
            <OffsetControl
              field='startMinutes'
              label='开始时间偏移'
              unit='分钟'
              max={60}
              config={config}
              update={update}
              disabled={studio.busy || saving}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='run-start'>起始时间 / 本地时间</Label>
            <Input
              id='run-start'
              type='datetime-local'
              step='1'
              required
              value={start}
              disabled={studio.busy}
              onChange={(e) => {
                studio.clear();
                setStart(e.target.value);
              }}
            />
          </div>
          <p className='text-xs leading-6 text-muted-foreground'>
            每次生成使用新的随机种子，最终值完整保留在预览中。整数计数仍为整数；本地检查不代表学校判定。
          </p>
          <div className='border-t border-border pt-5'>
            <Button
              type='button'
              variant='outline'
              disabled={saving || studio.busy}
              onClick={() => setSaveOpen((v) => !v)}
            >
              <Save className='size-4' />
              保存为预设
            </Button>
            {saveOpen && (
              <div className='mt-4 flex flex-wrap gap-3'>
                <Input
                  aria-label='预设名称'
                  placeholder='例如：常用操场'
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={saving}
                />
                <Button
                  type='button'
                  disabled={saving || !name.trim()}
                  onClick={() => void save()}
                >
                  {saving ? '正在保存…' : '确认保存预设'}
                </Button>
                <p className='w-full text-xs text-muted-foreground'>
                  保存选点和参数，不保存本次时间或提交授权。
                </p>
              </div>
            )}
          </div>
          <div className='flex flex-wrap justify-between gap-3'>
            <Button
              type='button'
              variant='outline'
              disabled={studio.busy}
              onClick={() => void stepper.prev()}
            >
              <ArrowLeft className='size-4' />
              上一步
            </Button>
            <Button type='submit' disabled={studio.busy || saving}>
              <WandSparkles className='size-4' />
              {studio.busy ? '正在生成…' : '生成并检查'}
            </Button>
          </div>
        </form>
      )}
      {stepper.current.id === 'preview' && preview && (
        <section className='space-y-5'>
          <RunPreviewCard
            preview={preview}
            exportPreview={exportPreview}
            mapLoaded={mapEnabled}
            onMapLoad={() => setMapEnabled(true)}
          />
          <div className='flex flex-wrap justify-between gap-3'>
            <Button variant='outline' onClick={() => void stepper.prev()}>
              返回调整参数
            </Button>
            <Button onClick={() => void stepper.next()}>
              下一步：确认提交
              <ArrowRight className='size-4' />
            </Button>
          </div>
        </section>
      )}
      {stepper.current.id === 'confirm' && preview && (
        <section className='space-y-5'>
          <div className='rounded-xl border border-border bg-card p-5'>
            <h2 className='text-lg font-semibold'>
              检查完成，由你决定是否提交。
            </h2>
            <p className='mt-3 text-sm text-muted-foreground'>
              {(preview.actualDistanceM / 1000).toFixed(3)} km ·{' '}
              {preview.input.durationS} 秒 · {preview.input.steps} 步
            </p>
            <p className='mt-3 text-xs text-muted-foreground'>
              合成来源会保留；学校规则、重复防护和结果核对仍适用。
            </p>
          </div>
          <SubmissionPanel key={preview.digest} preview={preview} />
          <Button variant='outline' onClick={() => void stepper.prev()}>
            返回预览
          </Button>
        </section>
      )}
    </div>
  );
}
export function StudioPage() {
  const { active, ready } = useDashboardAccount();
  return ready && active ? (
    <StudioContent key={active.id} accountId={active.id} />
  ) : (
    <AccountRequired />
  );
}
