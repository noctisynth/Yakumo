import { Download } from 'lucide-react';
import { StudioMap } from '@/components/studio-map';
import { Button } from '@/components/ui/button';
import type { RunPreview } from '@/models/run';
export function RunPreviewCard({
  preview,
  exportPreview,
  mapLoaded,
  onMapLoad,
}: {
  preview: RunPreview;
  exportPreview: () => Promise<void>;
  mapLoaded?: boolean;
  onMapLoad?: () => void;
}) {
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
        <div className='px-5'>
          <StudioMap
            latitude={preview.input.latitude}
            longitude={preview.input.longitude}
            points={preview.points}
            defaultLoaded={mapLoaded}
            onLoad={onMapLoad}
          />
        </div>
        <p className='px-5 pb-5 text-[11px] text-muted-foreground'>
          地图仅作地理参照，合成轨迹未匹配道路 · {preview.points.length} 个点 ·{' '}
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
      <details className='rounded-xl border border-border bg-card p-5 text-xs'>
        <summary className='cursor-pointer'>本次实际参数与种子</summary>
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
            ['圈数', String(preview.input.laps)],
            ['生成种子', preview.input.seed],
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
          分钟步数增量 · {preview.stepBuckets.length} 桶
        </summary>
        <p className='mt-3 break-words leading-6 text-muted-foreground'>
          {preview.stepBuckets.join(' / ')}
        </p>
      </details>
    </>
  );
}
