import type { RoutePoint } from '@/models/run';
export const offsetKeys = [
  'distanceM',
  'durationS',
  'steps',
  'laps',
  'positionM',
  'startMinutes',
] as const;
export type OffsetKey = (typeof offsetKeys)[number];
export type Offsets = Record<OffsetKey, [number, number]>;
export interface StudioConfig {
  route?: RoutePoint[];
  paceSecondsPerKm?: number;
  cadence?: number;
  cadenceOffset?: [number, number];
  latitude: number | null;
  longitude: number | null;
  distanceM: number;
  durationS: number;
  steps: number;
  laps: number;
  offsets: Offsets;
}
export interface StudioPreset {
  id: string;
  accountId: string;
  name: string;
  config: StudioConfig;
}
export const defaultConfig = (): StudioConfig => ({
  latitude: null,
  longitude: null,
  distanceM: 2000,
  durationS: 900,
  steps: 2400,
  laps: 5,
  offsets: {
    distanceM: [-30, 30],
    durationS: [-15, 15],
    steps: [-50, 50],
    laps: [0, 0],
    positionM: [0, 0],
    startMinutes: [0, 0],
  },
});
