import { items, numeric, object, quantity, text } from '@/lib/exercise-data';
import type { JsonValue } from '@/models/exercise';

export function MileageChart({ dates }: { dates: JsonValue | undefined }) {
  const values = [
    ...new Map(
      items(dates)
        .slice(0, 14)
        .map(object)
        .filter(
          (item) =>
            numeric(item.totalRange) !== null && text(item.date, '') !== '',
        )
        .map((item) => [text(item.date), item]),
    ).values(),
  ];
  if (!values.length)
    return (
      <p className='py-10 text-center text-sm text-muted-foreground'>
        当前日期分组暂无里程数据。
      </p>
    );
  const max = Math.max(
    1,
    ...values.map((item) => numeric(item.totalRange) ?? 0),
  );
  const width = 600 / values.length;
  return (
    <svg
      viewBox='0 0 600 165'
      role='img'
      aria-label='当前记录查询的日期里程分布'
      className='w-full'
    >
      <title>当前记录查询的日期里程分布，单位公里</title>
      <line x1='0' x2='600' y1='130' y2='130' className='stroke-border' />
      {values.map((item, index) => {
        const distance = Math.max(0, numeric(item.totalRange) ?? 0);
        const height = (distance / max) * 90;
        return (
          <g key={text(item.date)}>
            <title>
              {text(item.date)}：{quantity(item.totalRange)} 公里
            </title>
            <rect
              x={index * width + width * 0.25}
              y={130 - height}
              width={width * 0.5}
              height={Math.max(1, height)}
              rx='5'
              className='fill-primary/75'
            />
            <text
              x={index * width + width / 2}
              y={120 - height}
              textAnchor='middle'
              className='fill-foreground text-[11px]'
            >
              {quantity(item.totalRange)}
            </text>
            <text
              x={index * width + width / 2}
              y='153'
              textAnchor='middle'
              className='fill-muted-foreground text-[10px]'
            >
              {text(item.date).slice(-5)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
