export interface MapProvider {
  id: 'osm' | 'tianditu';
  name: string;
  tiles: string[];
  minZoom: number;
  maxNativeZoom: number;
  attribution: string;
  attributionUrl: string;
}

export function mapProviders(tiandituKey?: string): MapProvider[] {
  const osm: MapProvider = {
    id: 'osm',
    name: 'OpenStreetMap',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    minZoom: 0,
    maxNativeZoom: 19,
    attribution: '© OpenStreetMap contributors',
    attributionUrl: 'https://www.openstreetmap.org/copyright',
  };
  const key = tiandituKey?.trim();
  if (!key) return [osm];
  if (!/^[a-f\d]{32}$/i.test(key)) {
    throw new Error(
      'VITE_TIANDITU_KEY must be a valid 32-character map access key.',
    );
  }
  const tile = (layer: 'vec' | 'cva') =>
    `https://t0.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${key}`;
  return [
    {
      id: 'tianditu',
      name: '天地图',
      tiles: [tile('vec'), tile('cva')],
      minZoom: 1,
      maxNativeZoom: 18,
      attribution: '© 天地图',
      attributionUrl: 'https://www.tianditu.gov.cn/',
    },
    osm,
  ];
}
