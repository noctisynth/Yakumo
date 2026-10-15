import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Minus, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { RoutePoint, RunPoint } from '@/models/run';
export function StudioMap({
  latitude,
  longitude,
  onPick,
  waypoints,
  routeEditing = false,
  points,
  defaultLoaded = false,
  onLoad,
}: {
  latitude: number | null;
  longitude: number | null;
  onPick?: (latitude: number, longitude: number) => void;
  routeEditing?: boolean;
  waypoints?: RoutePoint[];
  points?: RunPoint[];
  defaultLoaded?: boolean;
  onLoad?: () => void;
}) {
  const [loaded, setLoaded] = useState(defaultLoaded),
    [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState({ level: 0, min: 0, max: 19 });
  const container = useRef<HTMLElement>(null),
    map = useRef<L.Map | null>(null),
    layer = useRef<L.LayerGroup | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const center = useRef({ latitude, longitude });
  center.current = { latitude, longitude };
  useEffect(() => {
    const { latitude, longitude } = center.current;
    if (!loaded || !container.current) return;
    const m = L.map(container.current, {
      scrollWheelZoom: true,
      touchZoom: true,
      zoomControl: false,
      attributionControl: false,
    }).setView(
      [latitude ?? 30.67, longitude ?? 104.07],
      latitude === null ? 11 : 17,
    );
    map.current = m;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    })
      .on('tileerror', () => setFailed(true))
      .addTo(m);
    const updateZoom = () =>
      setZoom({ level: m.getZoom(), min: m.getMinZoom(), max: m.getMaxZoom() });
    m.on('zoomend zoomlevelschange', updateZoom);
    updateZoom();
    layer.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (Math.abs(e.latlng.lat) <= 85 && Math.abs(e.latlng.lng) <= 179)
        pick.current?.(
          Number(e.latlng.lat.toFixed(7)),
          Number(e.latlng.lng.toFixed(7)),
        );
    });
    const observer = new ResizeObserver(() => m.invalidateSize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      m.remove();
      map.current = null;
      layer.current = null;
    };
    // The map instance is created once per explicit load; selection updates below.
  }, [loaded]);
  useEffect(() => {
    if (!loaded || !map.current || !layer.current) return;
    layer.current.clearLayers();
    if (points?.length) {
      const line = L.polyline(
        points.map((p) => [p.a, p.o] as [number, number]),
        { color: '#c6a76b', weight: 3 },
      ).addTo(layer.current);
      map.current.fitBounds(line.getBounds(), {
        padding: [24, 24],
        maxZoom: 18,
      });
    }
    if (waypoints?.length) {
      L.polyline(
        waypoints.map((p) => [p.latitude, p.longitude] as [number, number]),
        { color: '#c6a76b', weight: 3, dashArray: '6 5' },
      ).addTo(layer.current);
      for (const [index, p] of waypoints.entries()) {
        L.circleMarker([p.latitude, p.longitude], {
          radius: 7,
          color: '#242943',
          weight: 2,
          fillColor: '#e8c784',
          fillOpacity: 1,
        })
          .bindTooltip(String(index + 1), { permanent: true, direction: 'top' })
          .addTo(layer.current);
      }
    }
    if (latitude !== null && longitude !== null && !waypoints?.length) {
      L.circleMarker([latitude, longitude], {
        radius: 7,
        color: '#242943',
        weight: 2,
        fillColor: '#e8c784',
        fillOpacity: 1,
      }).addTo(layer.current);
      if (!points?.length) map.current.panTo([latitude, longitude]);
    }
  }, [loaded, latitude, longitude, points, waypoints]);
  return (
    <div className='overflow-hidden rounded-xl border border-border bg-muted/30'>
      {loaded ? (
        <>
          <div className='relative isolate'>
            <section
              ref={container}
              aria-label={onPick ? '地图选点' : '轨迹地图'}
              className='relative z-0 h-80 w-full touch-none sm:h-96'
            />
            <section
              aria-label='地图缩放'
              className='absolute top-3 left-3 z-10 flex flex-col gap-1 rounded-xl border border-border bg-card p-1 shadow-sm'
            >
              <Button
                type='button'
                variant='ghost'
                size='icon-lg'
                className='size-11 text-foreground sm:size-9'
                aria-label='放大地图'
                title='放大地图'
                disabled={zoom.level >= zoom.max}
                onClick={() => map.current?.zoomIn()}
              >
                <Plus className='size-4' />
              </Button>
              <Button
                type='button'
                variant='ghost'
                size='icon-lg'
                className='size-11 text-foreground sm:size-9'
                aria-label='缩小地图'
                title='缩小地图'
                disabled={zoom.level <= zoom.min}
                onClick={() => map.current?.zoomOut()}
              >
                <Minus className='size-4' />
              </Button>
              <output aria-label='地图缩放级别' className='sr-only'>
                {zoom.level}
              </output>
            </section>
            <a
              href='https://www.openstreetmap.org/copyright'
              target='_blank'
              rel='noreferrer'
              className='absolute right-2 bottom-2 z-10 rounded-md border border-border bg-card/95 px-2 py-1 text-[11px] leading-4 text-foreground shadow-sm underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring'
            >
              © OpenStreetMap contributors
            </a>
          </div>
          {failed && (
            <p role='status' className='p-3 text-xs text-muted-foreground'>
              地图底图暂时无法加载，可继续手动输入坐标；轨迹未匹配道路。
            </p>
          )}
        </>
      ) : (
        <div className='flex min-h-64 flex-col items-center justify-center gap-4 p-6 text-center'>
          <p className='text-sm font-medium'>
            {onPick
              ? routeEditing
                ? '在真实地图上绘制运动路线'
                : '在真实地图上选择运动中心'
              : '在真实地图上查看合成轨迹'}
          </p>
          <p className='max-w-md text-xs leading-6 text-muted-foreground'>
            地图由 OpenStreetMap
            提供，加载时会向地图服务请求当前视野。不读取设备位置。
          </p>
          <Button
            type='button'
            variant='outline'
            onClick={() => {
              setLoaded(true);
              onLoad?.();
            }}
          >
            加载地图
          </Button>
        </div>
      )}
    </div>
  );
}
