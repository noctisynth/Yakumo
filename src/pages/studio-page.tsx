import { defineStepper } from '@stepperize/react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  LoaderCircle,
  LocateFixed,
  Save,
  Trash2,
  Undo2,
  WandSparkles,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { AccountRequired } from '@/components/account-required';
import { DateTimePicker } from '@/components/date-time-picker';
import { RunPreviewCard } from '@/components/run-preview-card';
import { StudioMap } from '@/components/studio-map';
import { SubmissionPanel } from '@/components/submission-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useDashboardAccount } from '@/hooks/use-dashboard-account';
import { localDateTime, paceConfig, sampleRun } from '@/lib/studio-sampling';
import { cn } from '@/lib/utils';
import type { OffsetKey, StudioConfig } from '@/models/studio';
import { defaultConfig } from '@/models/studio';
import {
  locationError,
  requestQueryLocation,
} from '@/services/location-service';
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
  const [locating, setLocating] = useState(false);
  const locationSequence = useRef(0);
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
      ? paceConfig(structuredClone(draft.config))
      : paceConfig(defaultConfig());
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
  const update = (value: StudioConfig) => {
    const next = paceConfig(value);
    locationSequence.current++;
    setLocating(false);
    setConfig(next);
    useStudioDraftStore.getState().set(accountId, next);
    setNotice(null);
    setError(null);
  };
  useEffect(
    () => () => {
      locationSequence.current++;
    },
    [],
  );
  async function locate() {
    if (locating) return;
    const sequence = ++locationSequence.current;
    setLocating(true);
    setError(null);
    try {
      const point = await requestQueryLocation();
      if (sequence !== locationSequence.current) return;
      update({
        ...config,
        route: [
          ...(config.route ?? []).slice(0, 49),
          { latitude: point.latitude, longitude: point.longitude },
        ],
        latitude: config.route?.length ? config.latitude : point.latitude,
        longitude: config.route?.length ? config.longitude : point.longitude,
      });
      setNotice(
        `已填入当前位置（精度约 ${Math.ceil(point.accuracy)} 米），可继续在地图调整。`,
      );
    } catch (e) {
      if (sequence === locationSequence.current) setError(locationError(e));
    } finally {
      if (sequence === locationSequence.current) setLocating(false);
    }
  }
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
          cadenceOffset: [0, 0],
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
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <h2 className='text-lg font-semibold'>沿着道路，逐点绘制路线</h2>
              <Button
                type='button'
                variant='outline'
                disabled={locating || (config.route?.length ?? 0) >= 50}
                onClick={() => void locate()}
              >
                {locating ? (
                  <LoaderCircle className='size-4 animate-spin' />
                ) : (
                  <LocateFixed className='size-4' />
                )}
                {locating ? '正在获取位置…' : '获取当前位置'}
              </Button>
            </div>
            <p className='mt-2 text-xs leading-6 text-muted-foreground'>
              点击地图依次选点。仅点击获取位置后请求权限，不会自动定位。
            </p>
          </div>
          <div className='space-y-3 rounded-lg bg-muted/30 p-4'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <p className='text-sm font-medium'>
                已选 {config.route?.length ?? 0} / 50 个点
              </p>
              <div className='flex gap-2'>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={!config.route?.length}
                  onClick={() =>
                    update({ ...config, route: config.route?.slice(0, -1) })
                  }
                >
                  <Undo2 className='size-3.5' />
                  撤销选点
                </Button>
                <Button
                  size='sm'
                  variant='ghost'
                  disabled={!config.route?.length}
                  onClick={() => update({ ...config, route: [] })}
                >
                  <Trash2 className='size-3.5' />
                  清空
                </Button>
              </div>
            </div>
            <p className='text-xs leading-6 text-muted-foreground'>
              按经过顺序点击地图，弯道请补点；至少 2 点，总长度 50 米至 30
              公里。按目标距离截断，闭合路线按顺序循环，开放路线原路折返。沿线速度随种子平滑变化（约
              ±5%）。选点直连，未进行道路匹配。
            </p>
          </div>
          <StudioMap
            defaultLoaded={mapEnabled}
            onLoad={() => setMapEnabled(true)}
            latitude={config.latitude}
            longitude={config.longitude}
            routeEditing
            waypoints={config.route}
            onPick={(latitude, longitude) => {
              if ((config.route?.length ?? 0) >= 50) {
                setError('最多选择 50 个路线点，请先撤销或清空。');
                return;
              }
              update({
                ...config,
                latitude: config.route?.length ? config.latitude : latitude,
                longitude: config.route?.length ? config.longitude : longitude,
                route: [...(config.route ?? []), { latitude, longitude }],
              });
            }}
          />
          <div className='flex justify-end'>
            <Button
              disabled={
                locating ||
                (config.route?.length ?? 0) < 2 ||
                config.latitude === null ||
                config.longitude === null ||
                !Number.isFinite(config.latitude) ||
                !Number.isFinite(config.longitude) ||
                Math.abs(config.latitude) > 85 ||
                Math.abs(config.longitude) > 179
              }
              onClick={() => void stepper.next()}
            >
              设置参数
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
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <h2 className='text-lg font-semibold'>基准值与偏移范围</h2>
              <Button
                type='button'
                size='sm'
                variant='default'
                disabled={saving || studio.busy}
                onClick={() => setSaveOpen((v) => !v)}
              >
                <Save className='size-3.5' />
                保存为预设
              </Button>
            </div>
            <p className='mt-3 text-xs leading-6 text-muted-foreground'>
              拖动两端设置相对基准的最小、最大偏移，0
              表示不偏移。填写距离和配速，其余参数同步计算。
            </p>
          </div>
          <div className='grid gap-5 md:grid-cols-2'>
            <div className='space-y-5 rounded-xl border border-border p-4'>
              <div className='space-y-2'>
                <Label htmlFor='run-distanceM'>距离 / 公里</Label>
                <Input
                  id='run-distanceM'
                  type='number'
                  min={0.1}
                  max={30}
                  step={0.01}
                  required
                  value={
                    Number.isFinite(config.distanceM)
                      ? config.distanceM / 1000
                      : ''
                  }
                  disabled={studio.busy || saving}
                  onChange={(e) =>
                    update({
                      ...config,
                      distanceM:
                        e.target.value === ''
                          ? NaN
                          : Number(e.target.value) * 1000,
                    })
                  }
                />
              </div>
              <OffsetControl
                field='distanceM'
                label='距离偏移'
                unit='米'
                max={1000}
                step={0.1}
                config={config}
                update={update}
                disabled={studio.busy || saving}
              />
            </div>
            <div className='space-y-5 rounded-xl border border-border p-4'>
              <p className='text-sm font-medium'>预期配速 / 每公里</p>
              <div className='grid grid-cols-2 gap-3'>
                <div className='space-y-2'>
                  <Label htmlFor='run-pace-minutes'>分钟</Label>
                  <Input
                    id='run-pace-minutes'
                    type='number'
                    min={0}
                    max={20}
                    step={1}
                    required
                    disabled={studio.busy || saving}
                    value={Math.floor((config.paceSecondsPerKm ?? 450) / 60)}
                    onChange={(e) =>
                      update({
                        ...config,
                        paceSecondsPerKm:
                          Number(e.target.value) * 60 +
                          ((config.paceSecondsPerKm ?? 450) % 60),
                      })
                    }
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='run-pace-seconds'>秒</Label>
                  <Input
                    id='run-pace-seconds'
                    type='number'
                    min={0}
                    max={59}
                    step={1}
                    required
                    disabled={studio.busy || saving}
                    value={(config.paceSecondsPerKm ?? 450) % 60}
                    onChange={(e) =>
                      update({
                        ...config,
                        paceSecondsPerKm:
                          Math.floor((config.paceSecondsPerKm ?? 450) / 60) *
                            60 +
                          Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <OffsetControl
                field='durationS'
                label='配速偏移'
                unit='秒/公里'
                max={60}
                config={config}
                update={update}
                disabled={studio.busy || saving}
              />
            </div>
          </div>
          <section className='rounded-xl bg-muted/30 p-5' aria-label='自动估算'>
            <p className='text-sm font-medium'>其余参数，自动计算</p>
            <dl className='mt-4 grid grid-cols-2 gap-5 sm:grid-cols-4'>
              {[
                [
                  '预计时长',
                  `${Math.floor(config.durationS / 60)} 分 ${config.durationS % 60} 秒`,
                ],
                ['估算步数', `${config.steps.toLocaleString()} 步`],
                [
                  '平均速度',
                  `${((config.distanceM / config.durationS) * 3.6).toFixed(2)} km/h`,
                ],
                [
                  '估算单步距离',
                  `${(config.distanceM / config.steps).toFixed(2)} 米`,
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className='text-xs text-muted-foreground'>{label}</dt>
                  <dd className='mt-2 text-sm font-medium tabular-nums'>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className='mt-4 text-xs leading-6 text-muted-foreground'>
              以上为基准估算；生成时抽取距离、配速与步频，再统一计算时长、速度与步数。步数使用假设步频{' '}
              {config.cadence ?? 160} 步/分钟，并非设备实测。
            </p>
          </section>
          <details className='rounded-xl border border-border p-4'>
            <summary className='cursor-pointer text-sm'>调整估算步频</summary>
            <div className='mt-4 space-y-2'>
              <Label htmlFor='run-cadence'>步频 / 步每分钟</Label>
              <Input
                id='run-cadence'
                type='number'
                min={30}
                max={300}
                step={1}
                value={config.cadence ?? 160}
                disabled={studio.busy || saving}
                onChange={(e) =>
                  update({ ...config, cadence: Number(e.target.value) })
                }
              />
              <p className='text-xs leading-6 text-muted-foreground'>
                距离和配速不能唯一确定步数；有个人实测步频时可在这里替换假设值。
              </p>
              <div className='space-y-3 pt-3'>
                <p className='text-xs text-muted-foreground'>
                  步频偏移 {config.cadenceOffset?.[0] ?? -3} 至 +
                  {config.cadenceOffset?.[1] ?? 3} 步/分钟
                </p>
                <Slider
                  aria-label='步频偏移'
                  min={-30}
                  max={30}
                  step={1}
                  value={config.cadenceOffset ?? [-3, 3]}
                  disabled={studio.busy || saving}
                  onValueChange={(value) =>
                    update({ ...config, cadenceOffset: [value[0], value[1]] })
                  }
                />
              </div>
            </div>
          </details>
          <OffsetControl
            field='startMinutes'
            label='开始时间偏移'
            unit='分钟'
            max={60}
            config={config}
            update={update}
            disabled={studio.busy || saving}
          />
          <div className='space-y-2'>
            <p className='text-sm font-medium'>起始时间 / 本地时间</p>
            <DateTimePicker
              value={start}
              disabled={studio.busy}
              onChange={(value) => {
                studio.clear();
                setStart(value);
              }}
            />
          </div>
          <p className='text-xs leading-6 text-muted-foreground'>
            每次生成使用新的随机种子，最终值完整保留在预览中。整数计数仍为整数；本地检查不代表学校判定。
          </p>
          {saveOpen && (
            <div className='border-t border-border pt-5'>
              <div className='mt-4 flex flex-wrap gap-3'>
                <Input
                  aria-label='预设名称'
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      if (name.trim() && !saving) void save();
                    }
                  }}
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
            </div>
          )}
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
              确认提交
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
