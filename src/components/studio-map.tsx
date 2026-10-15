import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LoaderCircle, Minus, Plus, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { RoutePoint, RunPoint } from '@/models/run';
export function StudioMap({
  latitude,
  longitude,
  onPick,
  focusPoint,
  waypoints,
  closeLoop = false,
  points,
  detail = false,
}: {
  latitude: number | null;
  longitude: number | null;
  onPick?: (latitude: number, longitude: number) => void;
  focusPoint?: RoutePoint;
  closeLoop?: boolean;
  waypoints?: RoutePoint[];
  points?: RunPoint[];
  detail?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [hasTiles, setHasTiles] = useState(false);
  const [failed, setFailed] = useState(false);
  const reload = useRef<() => void>(() => {});
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
    if (!container.current) return;
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
    let timeout: ReturnType<typeof setTimeout>;
    const current = () => map.current === m;
    const beginLoading = () => {
      if (!current()) return;
      setLoading(true);
      setFailed(false);
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (!current()) return;
        setLoading(false);
        setFailed(true);
      }, 15000);
    };
    const tileLayer = L.tileLayer(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxNativeZoom: 19,
        maxZoom: 22,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      },
    )
      .on('loading', beginLoading)
      .on('tileload', () => {
        if (current()) setHasTiles(true);
      })
      .on('tileerror', () => {
        if (current()) setFailed(true);
      })
      .on('load', () => {
        if (!current()) return;
        clearTimeout(timeout);
        setLoading(false);
      })
      .addTo(m);
    reload.current = () => {
      beginLoading();
      tileLayer.redraw();
    };
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
      clearTimeout(timeout);
      observer.disconnect();
      reload.current = () => {};
      m.remove();
      map.current = null;
      layer.current = null;
    };
    // The map loads on mount; drawing and viewport changes are handled below.
  }, []);
  useEffect(() => {
    if (!map.current || !layer.current) return;
    layer.current.clearLayers();
    if (points?.length) {
      L.polyline(
        points.map((p) => [p.a, p.o] as [number, number]),
        { color: '#c6a76b', weight: 3, smoothFactor: 0 },
      ).addTo(layer.current);
    }
    if (waypoints?.length) {
      L.polyline(
        (closeLoop && waypoints.length >= 3
          ? [...waypoints, waypoints[0]]
          : waypoints
        ).map((p) => [p.latitude, p.longitude] as [number, number]),
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
  }, [latitude, longitude, points, waypoints, closeLoop]);
  useEffect(() => {
    if (!map.current || !focusPoint) return;
    map.current.setView(
      [focusPoint.latitude, focusPoint.longitude],
      Math.min(map.current.getMaxZoom(), Math.max(map.current.getZoom(), 16)),
    );
  }, [focusPoint]);
  useEffect(() => {
    if (!map.current || !points?.length) return;
    if (detail) {
      const point = points[Math.min(10, points.length - 1)];
      map.current.setView([point.a, point.o], 22);
    } else {
      map.current.fitBounds(
        L.latLngBounds(points.map((p) => [p.a, p.o] as [number, number])),
        { padding: [24, 24], maxZoom: 18 },
      );
    }
  }, [points, detail]);
  return (
    <div className='overflow-hidden rounded-xl border border-border bg-muted/30'>
      <div className='relative isolate'>
        <section
          ref={container}
          aria-label={onPick ? '地图选点' : '轨迹地图'}
          className='relative z-0 h-[25rem] w-full touch-none sm:h-[32rem]'
        />
        {!hasTiles && (loading || failed) && (
          <div className='absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-card/95 p-6 text-center'>
            {loading ? (
              <div
                role='status'
                className='flex items-center gap-3 text-sm text-muted-foreground'
              >
                <LoaderCircle className='size-5 animate-spin text-primary' />
                正在加载地图…
              </div>
            ) : (
              <>
                <p role='status' className='text-sm text-muted-foreground'>
                  地图暂时无法加载，请检查网络后重试。
                </p>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => reload.current()}
                >
                  <RefreshCw className='size-4' />
                  重新加载地图
                </Button>
              </>
            )}
          </div>
        )}
        {hasTiles && loading && (
          <div
            role='status'
            className='pointer-events-none absolute top-3 right-3 z-10 flex items-center gap-2 rounded-lg bg-card/95 px-3 py-2 text-xs text-muted-foreground shadow-sm'
          >
            <LoaderCircle className='size-3.5 animate-spin' />
            加载中
          </div>
        )}
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
          className='absolute right-0 bottom-0 z-10 rounded-tl-md border border-border bg-card/95 px-2 py-1 text-[11px] leading-4 text-foreground shadow-sm underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring'
        >
          © OpenStreetMap contributors
        </a>
      </div>
      {failed && hasTiles && (
        <div className='flex items-center justify-between gap-3 border-t border-border p-3'>
          <p role='status' className='text-xs text-muted-foreground'>
            部分底图未能加载，可重试。
          </p>
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={() => reload.current()}
          >
            <RefreshCw className='size-3.5' />
            重新加载地图
          </Button>
        </div>
      )}
    </div>
  );
}
