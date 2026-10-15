export interface RoutePoint {
  latitude: number;
  longitude: number;
}
export interface RunInput {
  route?: RoutePoint[];
  targetPaceSecondsPerKm?: number;
  estimatedCadence?: number;
  seed: string;
  startTime: number;
  latitude: number;
  longitude: number;
  distanceM: number;
  durationS: number;
  steps: number;
  laps: number;
}
export interface RunPoint {
  a: number;
  o: number;
  t: number;
  s: number;
  i: boolean;
  c: number;
  e: number;
}
export interface RunPreview {
  input: RunInput;
  digest: string;
  algorithm: string;
  source: string;
  points: RunPoint[];
  stepBuckets: number[];
  actualDistanceM: number;
  pace: string;
  averageKmh: number;
  endTime: number;
  checks: string[];
}
