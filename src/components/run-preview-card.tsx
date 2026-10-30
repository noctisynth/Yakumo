import { Download, ScanSearch } from 'lucide-react';
import { useState } from 'react';
import { StudioMap } from '@/components/studio-map';
import { Button } from '@/components/ui/button';
import type { RunPreview } from '@/models/run';
export function RunPreviewCard({
  preview,
  exportPreview,
  exportError,
}: {
  preview: RunPreview;
  exportPreview: () => Promise<void>;
  exportError?: string | null;
}) {
  const [detail, setDetail] = useState(false);
  return (
    <>
      {' '}
      <div className='overflow-hidden rounded-xl border border-border bg-card'>
        <div className='flex items-center justify-between gap-2 border-b border-border p-5'>
          <h2 className='text-sm font-semibold'>03 / 合成预览</h2>
          <Button size='sm' variant='outline' onClick={exportPreview}>
            <Download className='size-3.5' />
            导出预览
          </Button>
        </div>
        {exportError && (
          <p
            role='alert'
            className='mx-5 mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive'
          >
            {exportError}
          </p>
        )}
        <div className='grid grid-cols-2 gap-5 p-5 sm:grid-cols-4'>
          {[
            ['距离', `${(preview.actualDistanceM / 1000).toFixed(3)} km`],
            ['时长', `${preview.input.durationS} 秒`],
            ['配速', preview.pace],
            ['平均速度', `${preview.averageKmh.toFixed(2)} km/h`],
          ].map(([label, value]) => (
            <div key={label}>
              <p className='text-xs text-muted-foreground'>{label}</p>
              <p className='mt-2 text-lg font-medium tabular-nums'>{value}</p>
            </div>
          ))}
        </div>
        <div className='space-y-3 px-5'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <p className='text-xs text-muted-foreground'>
              最终上报轨迹 · 坐标浮动最多{' '}
              {(
                preview.coordinateNoiseM ??
                preview.input.coordinateNoiseM ??
                0
              ).toFixed(2)}{' '}
              米
            </p>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setDetail((value) => !value)}
            >
              <ScanSearch className='size-3.5' />
              {detail ? '查看全程' : '查看局部'}
            </Button>
          </div>
          <StudioMap
            latitude={preview.points[0]?.a ?? preview.input.latitude}
            longitude={preview.points[0]?.o ?? preview.input.longitude}
            points={preview.points}
            detail={detail}
          />
        </div>
        <p className='px-5 pb-5 text-[11px] text-muted-foreground'>
          生成路线 · {preview.points.length} 个点 · {preview.input.steps} 步
        </p>
      </div>
      <div className='rounded-xl border border-border bg-card p-5'>
        <h2 className='text-sm font-semibold'>运动数据检查</h2>
        <ul className='mt-4 space-y-2 text-xs text-muted-foreground'>
          {preview.checks.map((check) => (
            <li key={check}>✓ {check}</li>
          ))}
        </ul>
        <p className='mt-3 text-xs text-primary'>
          检查通过，请继续核对并确认提交。
        </p>
      </div>
      <details className='rounded-xl border border-border bg-card p-5 text-xs'>
        <summary className='cursor-pointer'>本次运动参数</summary>
        <dl className='mt-4 grid gap-4 sm:grid-cols-2'>
          {[
            ['目标距离', `${preview.input.distanceM} 米`],
            [
              '开始时间',
              new Date(preview.input.startTime).toLocaleString('zh-CN'),
            ],
            [
              '中心坐标',
              `${preview.input.latitude.toFixed(7)}, ${preview.input.longitude.toFixed(7)}`,
            ],
            preview.input.route?.length
              ? [
                  '路线',
                  `${preview.input.route.length} 个选点 · 按目标距离行进`,
                ]
              : ['圈数', String(preview.input.laps)],
            ...(preview.input.estimatedCadence === undefined
              ? []
              : [
                  ['估算步频', `${preview.input.estimatedCadence} 步/分钟`],
                  [
                    '本次配速',
                    `${preview.input.targetPaceSecondsPerKm?.toFixed(2)} 秒/公里`,
                  ],
                ]),
          ].map(([label, value]) => (
            <div key={label}>
              <dt className='text-muted-foreground'>{label}</dt>
              <dd className='mt-2 break-all'>{value}</dd>
            </div>
          ))}
        </dl>
      </details>
      <details className='rounded-xl border border-border p-5 text-xs'>
        <summary className='cursor-pointer'>
          每分钟步数 · {preview.stepBuckets.length} 分钟
        </summary>
        <p className='mt-3 break-words leading-6 text-muted-foreground'>
          {preview.stepBuckets.join(' / ')}
        </p>
      </details>
    </>
  );
}
