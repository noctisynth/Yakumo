import { MapPin, SlidersHorizontal } from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { DataFeedback } from '@/components/data-feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { object, text } from '@/lib/exercise-data';
import { useDashboardStore } from '@/stores/dashboard-store';

const fields = [
  ['totalRange', '单次要求距离（公里）'],
  ['minSaveRange', '最低保存距离（公里）'],
  ['startQualifiedTime', '最短时长（分钟）'],
  ['endQualifiedTime', '最长时长（分钟，-1 无上限）'],
  ['step', '基础步数要求'],
  ['surplusNum', '服务端剩余次数'],
  ['limitSpeed', '速度阈值'],
  ['startStride', '步幅下界'],
  ['endStride', '步幅上界'],
  ['startLimitStepFrequency', '步频下界'],
  ['endLimitStepFrequency', '步频上界'],
  ['needRegisterFace', '人脸注册要求'],
  ['isStartFace', '开始人脸开关'],
  ['isEndFace', '结束人脸开关'],
] as const;

export function SchoolSettingsPanel() {
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const { settings, read } = useDashboardStore();
  const data = object(settings.data);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
              输入本次查询坐标，读取运动类型 1 的当前要求。
            </span>
          </span>
        </span>
      </div>
      <div className='mt-6 space-y-5'>
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
              disabled={settings.loading}
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
              disabled={settings.loading}
            />
          </div>
          <Button type='submit' className='h-10' disabled={settings.loading}>
            读取学校配置
          </Button>
        </form>
        <p className='flex items-start gap-2 text-xs leading-6 text-muted-foreground'>
          <MapPin className='mt-1 size-3.5 shrink-0' aria-hidden='true' />
          仅发送你输入的坐标，不读取设备定位、不保存坐标；此操作不会开始运动。
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
              未确认单位的阈值及开关按学校原值展示；缺失值不代表没有要求。当前配置不等于本次运动已达标。
            </p>
          </>
        )}
      </div>
    </section>
  );
}
