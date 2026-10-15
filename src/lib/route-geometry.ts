import type { RoutePoint } from '@/models/run';
export function routeLength(points: RoutePoint[], closeLoop: boolean): number {
  const distance = (a: RoutePoint, b: RoutePoint) => {
    const radians = (n: number) => (n * Math.PI) / 180;
    const h =
      Math.sin(radians(b.latitude - a.latitude) / 2) ** 2 +
      Math.cos(radians(a.latitude)) *
        Math.cos(radians(b.latitude)) *
        Math.sin(radians(b.longitude - a.longitude) / 2) ** 2;
    return 12742000 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
  };
  let total = 0;
  for (let i = 1; i < points.length; i++)
    total += distance(points[i - 1], points[i]);
  if (closeLoop && points.length >= 3) {
    const closing = distance(points[points.length - 1], points[0]);
    if (closing >= 1) total += closing;
  }
  return Math.round(total * 10) / 10;
}
