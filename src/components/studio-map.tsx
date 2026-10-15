import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { RunPoint } from '@/models/run';
export function StudioMap({
  latitude,
  longitude,
  onPick,
  points,
  defaultLoaded = false,
  onLoad,
}: {
  latitude: number | null;
  longitude: number | null;
  onPick?: (latitude: number, longitude: number) => void;
  points?: RunPoint[];
  defaultLoaded?: boolean;
  onLoad?: () => void;
}) {
  const [loaded, setLoaded] = useState(defaultLoaded),
    [failed, setFailed] = useState(false);
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
    const m = L.map(container.current, { scrollWheelZoom: false }).setView(
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
    if (latitude !== null && longitude !== null) {
      L.circleMarker([latitude, longitude], {
        radius: 7,
        color: '#242943',
        weight: 2,
        fillColor: '#e8c784',
        fillOpacity: 1,
      }).addTo(layer.current);
      if (!points?.length) map.current.panTo([latitude, longitude]);
    }
  }, [loaded, latitude, longitude, points]);
  return (
    <div className='overflow-hidden rounded-xl border border-border bg-muted/30'>
      {loaded ? (
        <>
          <section
            ref={container}
            aria-label={onPick ? '地图选点' : '轨迹地图'}
            className='relative z-0 h-80 w-full sm:h-96'
          />
          {failed && (
            <p role='status' className='p-3 text-xs text-muted-foreground'>
              地图底图暂时无法加载，可继续手动输入坐标；轨迹未匹配道路。
            </p>
          )}
        </>
      ) : (
        <div className='flex min-h-64 flex-col items-center justify-center gap-4 p-6 text-center'>
          <p className='text-sm font-medium'>
            {onPick ? '在真实地图上选择运动中心' : '在真实地图上查看合成轨迹'}
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
