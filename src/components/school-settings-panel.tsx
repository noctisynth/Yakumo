import {
  LoaderCircle,
  LocateFixed,
  MapPin,
  SlidersHorizontal,
} from 'lucide-react';
import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { DataFeedback } from '@/components/data-feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { object, text } from '@/lib/exercise-data';
import {
  locationError,
  requestQueryLocation,
} from '@/services/location-service';
import { useDashboardStore } from '@/stores/dashboard-store';

const fields = [
  ['totalRange', '单次要求距离（公里）'],
  ['minSaveRange', '最低保存距离（公里）'],
  ['startQualifiedTime', '最短时长（分钟）'],
  ['endQualifiedTime', '最长时长（分钟，-1 无上限）'],
  ['step', '基础步数要求'],
  ['surplusNum', '剩余次数'],
  ['limitSpeed', '速度限制'],
  ['startStride', '最小步幅'],
  ['endStride', '最大步幅'],
  ['startLimitStepFrequency', '最低步频'],
  ['endLimitStepFrequency', '最高步频'],
  ['needRegisterFace', '人脸注册要求'],
  ['isStartFace', '开始时人脸验证'],
  ['isEndFace', '结束时人脸验证'],
] as const;

export function SchoolSettingsPanel() {
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [locating, setLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [locationFailure, setLocationFailure] = useState<string | null>(null);
  const live = useRef(true);
  const locatingRef = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  async function locate() {
    if (locatingRef.current) return;
    locatingRef.current = true;
    setLocating(true);
    setLocationFailure(null);
    setLocationNotice(null);
    try {
      const position = await requestQueryLocation();
      if (!live.current) return;
      setLatitude(String(position.latitude));
      setLongitude(String(position.longitude));
      setLocationNotice(
        `已填入当前位置（精度约 ${Math.ceil(position.accuracy)} 米）。确认后点击“读取学校配置”。`,
      );
    } catch (error) {
      if (live.current) setLocationFailure(locationError(error));
    } finally {
      locatingRef.current = false;
      if (live.current) setLocating(false);
    }
  }
  const { settings, read } = useDashboardStore();
  const data = object(settings.data);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locatingRef.current) return;
    if (!latitude.trim() || !longitude.trim()) return;
    await read('settings', {
      kind: 'settings',
      latitude: Number(latitude),
      longitude: Number(longitude),
      runType: 1,
    });
  }
  return (
    <section
      className='rounded-xl border border-border bg-card p-5 md:p-7'
      aria-label='学校运动配置'
    >
      <div>
        <span className='flex items-center gap-3'>
          <SlidersHorizontal
            className='size-5 text-primary'
            aria-hidden='true'
          />
          <span className='flex-1'>
            <span className='block text-lg font-medium'>学校运动配置</span>
            <span className='mt-1 block text-xs leading-6 text-muted-foreground'>
              手动输入坐标或获取当前位置，再读取学校要求。
            </span>
          </span>
        </span>
      </div>
      <div className='mt-6 space-y-5'>
        <div className='flex flex-wrap items-center gap-3'>
          <Button
            type='button'
            variant='outline'
            disabled={locating || settings.loading}
            onClick={() => void locate()}
          >
            {locating ? (
              <LoaderCircle
                className='size-4 animate-spin'
                aria-hidden='true'
              />
            ) : (
              <LocateFixed className='size-4' aria-hidden='true' />
            )}
            {locating ? '正在获取位置…' : '获取当前位置'}
          </Button>
          <p className='text-xs leading-6 text-muted-foreground'>
            仅在点击后请求权限并定位一次，不会自动查询学校。
          </p>
        </div>
        {locationFailure && (
          <p
            role='alert'
            className='rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-xs leading-6 text-destructive'
          >
            {locationFailure}
          </p>
        )}
        {locationNotice && (
          <p role='status' className='text-xs leading-6 text-muted-foreground'>
            {locationNotice}
          </p>
        )}

        <form
          onSubmit={submit}
          className='grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]'
        >
          <div className='space-y-2'>
            <Label htmlFor='settings-latitude'>纬度</Label>
            <Input
              id='settings-latitude'
              type='number'
              min='-90'
              max='90'
              step='any'
              required
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
              placeholder='-90 至 90'
              disabled={settings.loading || locating}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='settings-longitude'>经度</Label>
            <Input
              id='settings-longitude'
              type='number'
              min='-180'
              max='180'
              step='any'
              required
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
              placeholder='-180 至 180'
              disabled={settings.loading || locating}
            />
          </div>
          <Button
            type='submit'
            className='h-10'
            disabled={settings.loading || locating}
          >
            读取学校配置
          </Button>
        </form>
        <p className='flex items-start gap-2 text-xs leading-6 text-muted-foreground'>
          <MapPin className='mt-1 size-3.5 shrink-0' aria-hidden='true' />
          读取配置时将向学校发送所填位置。
        </p>
        <DataFeedback resource={settings} />
        {settings.data !== null && (
          <>
            <dl className='grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3'>
              {fields.map(([key, label]) => (
                <div key={key}>
                  <dt className='text-xs text-muted-foreground'>{label}</dt>
                  <dd className='mt-1.5 text-sm font-medium'>
                    {text(data[key])}
                  </dd>
                </div>
              ))}
            </dl>
            <p className='text-[11px] leading-6 text-muted-foreground'>
              暂无数据的项目显示 —，可点击“读取学校配置”刷新。
            </p>
          </>
        )}
      </div>
    </section>
  );
}
