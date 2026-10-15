import { defineStepper } from '@stepperize/react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  Gauge,
  LoaderCircle,
  LocateFixed,
  Route,
  Ruler,
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useDashboardAccount } from '@/hooks/use-dashboard-account';
import { routeLength } from '@/lib/route-geometry';
import { localDateTime, paceConfig, sampleRun } from '@/lib/studio-sampling';
import { cn } from '@/lib/utils';
import type { RoutePoint } from '@/models/run';
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
  { id: 'parameters', title: '距离与节奏' },
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
  const [mapFocus, setMapFocus] = useState<RoutePoint>();
  const [start, setStart] = useState(() =>
    localDateTime(Date.now() - 20 * 60000),
  );
  const [errorScope, setErrorScope] = useState<
    'location' | 'preset' | 'generate' | 'export'
  >('location');
  const [noticeScope, setNoticeScope] = useState<'location' | 'preset'>(
    'location',
  );
  const [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null),
    [name, setName] = useState(''),
    [saving, setSaving] = useState(false),
    [saveOpen, setSaveOpen] = useState(false);
  const generating = useRef(false),
    saveLock = useRef(false);
  const preview = studio.preview;
  const feedback = (scope: 'location' | 'preset' | 'generate') => {
    const message =
      errorScope === scope
        ? error || (scope === 'generate' ? studio.error : null)
        : null;
    return (
      <>
        {message && (
          <p
            role='alert'
            className='rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive'
          >
            {message}
          </p>
        )}
        {scope !== 'generate' && noticeScope === scope && notice && (
          <p role='status' className='rounded-lg bg-accent p-4 text-sm'>
            {notice}
          </p>
        )}
      </>
    );
  };
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
    setErrorScope('location');
    setNotice(null);
    setNoticeScope('location');
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
      setMapFocus({ latitude: point.latitude, longitude: point.longitude });
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
    setErrorScope('generate');
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
    setErrorScope('preset');
    setNoticeScope('preset');
    setNotice(null);
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
    setError(null);
    try {
      if (isTauri() && (await invoke<boolean>('mobile_platform'))) {
        await invoke('export_mobile_preview', { input: preview.input });
        return;
      }
    } catch {
      setErrorScope('export');
      setError('无法保存预览，请重试。');
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
    <Dialog
      open={saveOpen}
      onOpenChange={(open) => {
        if (saving) return;
        setSaveOpen(open);
        if (errorScope === 'preset') setError(null);
        if (!open) setName('');
      }}
    >
      <div className='space-y-8'>
        <header className='flex flex-wrap items-end justify-between gap-5 border-b border-border pb-7'>
          <div>
            <p className='text-[10px] font-medium tracking-[0.3em] text-primary'>
              STUDIO / CREATE AT YOUR PACE
            </p>
            <h1 className='mt-3 text-3xl font-semibold tracking-tight sm:text-4xl'>
              生成工作室<span className='text-primary'>.</span>
            </h1>
            <p className='mt-3 text-sm text-muted-foreground'>
              规划路线、设定节奏，在预览后确认每一次提交。
            </p>
          </div>
          <Button asChild variant='default'>
            <Link to='/studio/presets'>
              <Bookmark className='size-4' />
              预设列表
            </Link>
          </Button>
        </header>
        <nav
          id='studio-steps'
          aria-label='生成步骤'
          className='grid grid-cols-4 gap-2 sm:gap-6'
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
                'group flex min-h-12 flex-col items-start justify-center gap-2 border-b-2 px-1 pb-4 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default sm:flex-row sm:items-center sm:justify-start sm:gap-3 sm:text-sm',
                i === stepper.index
                  ? 'border-primary text-primary'
                  : 'border-border text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-md border text-xs tabular-nums',
                  i === stepper.index ? 'border-primary' : 'border-border',
                )}
              >
                {i < stepper.index ? <Check className='size-3' /> : i + 1}
              </span>
              {s.title}
            </button>
          ))}
        </nav>
        {stepper.current.id === 'location' && (
          <section className='space-y-6'>
            <div>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <h2 className='text-lg font-semibold'>
                  沿着道路，逐点绘制路线
                </h2>
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
            <div className='grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]'>
              <div className='min-w-0'>
                <StudioMap
                  focusPoint={mapFocus}
                  defaultLoaded={mapEnabled}
                  onLoad={() => setMapEnabled(true)}
                  latitude={config.latitude}
                  longitude={config.longitude}
                  routeEditing
                  waypoints={config.route}
                  closeLoop={config.closeLoop}
                  onPick={(latitude, longitude) => {
                    if ((config.route?.length ?? 0) >= 50) {
                      setErrorScope('location');
                      setError('最多选择 50 个路线点，请先撤销或清空。');
                      return;
                    }
                    update({
                      ...config,
                      latitude: config.route?.length
                        ? config.latitude
                        : latitude,
                      longitude: config.route?.length
                        ? config.longitude
                        : longitude,
                      route: [...(config.route ?? []), { latitude, longitude }],
                    });
                  }}
                />
                <p className='mt-3 text-xs text-muted-foreground'>
                  地图选点用于规划，预览将显示最终生成的轨迹。
                </p>
              </div>
              <aside className='space-y-6 rounded-2xl border border-border bg-card p-5'>
                <p className='text-[10px] tracking-[0.2em] text-primary'>
                  ROUTE / 路线规划
                </p>
                <div className='space-y-4'>
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
                          update({
                            ...config,
                            route: config.route?.slice(0, -1),
                          })
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
                    依次标记起点和转弯处，可撤销或重新绘制。闭合路线至少 3
                    点；选线以直线连接，不会自动贴合道路。
                  </p>
                </div>
                <div className='flex items-center justify-between gap-4 border-t border-border pt-5'>
                  <div>
                    <Label
                      htmlFor='close-route'
                      className='flex items-center gap-2 text-sm'
                    >
                      <Route className='size-4 text-primary' />
                      首尾相连
                    </Label>
                    <p className='mt-1 text-xs leading-5 text-muted-foreground'>
                      连接末点与起点形成环线，至少 3 个选点；关闭则原路往返。
                    </p>
                  </div>
                  <Switch
                    id='close-route'
                    checked={config.closeLoop ?? true}
                    onCheckedChange={(checked) =>
                      update({ ...config, closeLoop: checked })
                    }
                  />
                </div>

                <div className='border-t border-border pt-5'>
                  <p className='text-xs text-muted-foreground'>
                    {config.closeLoop ? '单圈里程' : '单程里程'}
                  </p>
                  <p className='mt-2 text-3xl font-medium tracking-tight tabular-nums'>
                    {(
                      routeLength(
                        config.route ?? [],
                        config.closeLoop ?? true,
                      ) / 1000
                    ).toFixed(2)}
                    <span className='ml-2 text-sm font-normal text-muted-foreground'>
                      km
                    </span>
                  </p>
                  <p className='mt-2 text-xs leading-5 text-muted-foreground'>
                    完成选点后，作为本次距离的默认值。
                  </p>
                </div>
                {feedback('location')}
                <div className='flex justify-end'>
                  <Button
                    disabled={
                      locating ||
                      (config.route?.length ?? 0) <
                        (config.closeLoop ? 3 : 2) ||
                      config.latitude === null ||
                      config.longitude === null ||
                      !Number.isFinite(config.latitude) ||
                      !Number.isFinite(config.longitude) ||
                      Math.abs(config.latitude) > 85 ||
                      Math.abs(config.longitude) > 179
                    }
                    onClick={() => {
                      update({
                        ...config,
                        distanceM: routeLength(
                          config.route ?? [],
                          config.closeLoop ?? true,
                        ),
                      });
                      void stepper.next();
                    }}
                  >
                    设置参数
                    <ArrowRight className='size-4' />
                  </Button>
                </div>
              </aside>
            </div>
          </section>
        )}
        {stepper.current.id === 'parameters' && (
          <form
            className='space-y-7'
            onSubmit={(e) => {
              e.preventDefault();
              void generate();
            }}
          >
            <div>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <h2 className='text-lg font-semibold'>距离与节奏</h2>
                <DialogTrigger asChild>
                  <Button
                    type='button'
                    variant='default'
                    disabled={saving || studio.busy}
                  >
                    <Save className='size-3.5' />
                    保存为预设
                  </Button>
                </DialogTrigger>
              </div>
              <p className='mt-3 text-xs leading-6 text-muted-foreground'>
                拖动两端设置相对基准的最小、最大偏移，0
                表示不偏移。填写距离和配速，其余参数同步计算。
              </p>
            </div>
            {!saveOpen && feedback('preset')}
            <div className='grid gap-5 md:grid-cols-2'>
              <div className='flex flex-col gap-5 rounded-2xl bg-card p-6 sm:p-7'>
                <div className='flex h-5 items-center justify-between'>
                  <Label htmlFor='run-distanceM'>距离 / 公里</Label>
                  <Ruler className='size-4 text-primary' />
                </div>
                <div className='flex h-20 flex-col justify-end gap-2 pb-1'>
                  <p className='text-xs text-muted-foreground'>目标里程</p>
                  <Input
                    id='run-distanceM'
                    type='number'
                    min={0.1}
                    max={30}
                    step={0.0001}
                    required
                    value={
                      Number.isFinite(config.distanceM)
                        ? Number((config.distanceM / 1000).toFixed(4))
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
              <div className='flex flex-col gap-5 rounded-2xl bg-card p-6 sm:p-7'>
                <div className='flex h-5 items-center justify-between'>
                  <p className='text-sm font-medium'>预期配速 / 每公里</p>
                  <Gauge className='size-4 text-primary' />
                </div>
                <div className='grid h-20 grid-cols-2 items-end gap-3 pb-1'>
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
            <section
              className='border-y border-border py-6'
              aria-label='自动估算'
            >
              <p className='text-sm font-medium'>预计运动数据</p>
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
                    <dd className='mt-2 text-xl font-medium tracking-tight tabular-nums'>
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
            <div className='space-y-4 rounded-xl border border-border p-4'>
              <div className='flex items-center justify-between gap-3'>
                <p className='text-sm font-medium'>轨迹坐标浮动</p>
                <span className='text-xs tabular-nums text-muted-foreground'>
                  最多 {config.coordinateNoiseM ?? 0.8} 米
                </span>
              </div>
              <Slider
                aria-label='轨迹坐标浮动'
                min={0}
                max={3}
                step={0.1}
                value={[config.coordinateNoiseM ?? 0.8]}
                disabled={studio.busy || saving}
                onValueChange={(value) =>
                  update({ ...config, coordinateNoiseM: value[0] })
                }
              />
              <p className='text-xs leading-6 text-muted-foreground'>
                沿选线加入连续的小幅浮动；低速时自动收窄。0
                表示不浮动，最终轨迹可在预览中放大查看。
              </p>
            </div>
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
            {feedback('generate')}
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
              exportError={errorScope === 'export' ? error : null}
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
            <section className='rounded-xl border border-border bg-card p-5'>
              <h3 className='text-sm font-medium'>上报前检查</h3>
              <p className='mt-2 text-xs leading-6 text-muted-foreground'>
                检查字段结构、时间与里程一致性、配速、步频和逐段速度。当前客户端允许配速
                3–15 分钟/公里、步频 80–220 步/分钟；异常数据会在发送前拦截。
              </p>
            </section>
            <SubmissionPanel key={preview.digest} preview={preview} />
            <Button variant='outline' onClick={() => void stepper.prev()}>
              返回预览
            </Button>
          </section>
        )}
      </div>
      <DialogContent showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>保存为预设</DialogTitle>
          <DialogDescription>
            保存当前路线与参数，下次可直接使用。不会保存本次时间或提交授权。
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-6'
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() && !saving) void save();
          }}
        >
          <div className='space-y-2'>
            <Label htmlFor='preset-name'>预设名称</Label>
            <Input
              id='preset-name'
              placeholder='例如：常用操场'
              maxLength={80}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={saving}
            />
          </div>
          {errorScope === 'preset' && error && (
            <p role='alert' className='text-sm leading-6 text-destructive'>
              {error}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type='button' variant='outline' disabled={saving}>
                取消
              </Button>
            </DialogClose>
            <Button type='submit' disabled={saving || !name.trim()}>
              {saving ? '正在保存…' : '确认保存预设'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
