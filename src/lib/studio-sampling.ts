import type { RunInput } from '@/models/run';
import type { StudioConfig } from '@/models/studio';
export function sampleRun(
  config: StudioConfig,
  startTime: number,
  seed: string,
): RunInput {
  let state = 2166136261;
  for (const char of seed)
    state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  const random = () => {
    state += 0x6d2b79f5;
    let v = Math.imul(state ^ (state >>> 15), 1 | state);
    v ^= v + Math.imul(v ^ (v >>> 7), 61 | v);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
  const draw = (key: keyof StudioConfig['offsets']) => {
    const [lo, hi] = config.offsets[key];
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi)
      throw new Error('偏移范围无效，请检查参数。');
    return lo + random() * (hi - lo);
  };
  if (
    config.route?.length &&
    (config.route.length < 2 ||
      config.route.length > 50 ||
      config.route.some(
        (p) =>
          !Number.isFinite(p.latitude) ||
          !Number.isFinite(p.longitude) ||
          Math.abs(p.latitude) > 85 ||
          Math.abs(p.longitude) > 179,
      ))
  )
    throw new Error('请选择 2 至 50 个有效路线点。');
  if (config.latitude === null || config.longitude === null)
    throw new Error('请先在地图选点或填写坐标。');
  const latitude = config.route?.length
    ? config.route[0].latitude
    : config.latitude + draw('positionM') / 111195;
  const longitude = config.route?.length
    ? config.route[0].longitude
    : config.longitude +
      draw('positionM') /
        (111195 * Math.cos((config.latitude * Math.PI) / 180));
  const distanceM =
    Math.round((config.distanceM + draw('distanceM')) * 10) / 10;
  const pace =
    config.paceSecondsPerKm === undefined
      ? undefined
      : config.paceSecondsPerKm + draw('durationS');
  const durationS =
    pace === undefined
      ? Math.round(config.durationS + draw('durationS'))
      : Math.round((distanceM / 1000) * pace);
  const [cadenceLo, cadenceHi] = config.cadenceOffset ?? [-3, 3];
  if (
    ![cadenceLo, cadenceHi].every(Number.isFinite) ||
    cadenceLo > cadenceHi ||
    cadenceLo < -30 ||
    cadenceHi > 30
  )
    throw new Error('步频偏移范围无效。');
  const actualCadence =
    Math.round(
      ((config.cadence ?? 160) +
        cadenceLo +
        random() * (cadenceHi - cadenceLo)) *
        10,
    ) / 10;
  const steps =
    pace === undefined
      ? Math.round(config.steps + draw('steps'))
      : Math.round((durationS / 60) * actualCadence);
  const laps = config.route?.length
    ? 1
    : Math.round(config.laps + draw('laps'));
  const actualStart =
    Math.round((startTime + draw('startMinutes') * 60000) / 1000) * 1000;
  if (
    (pace !== undefined &&
      (!Number.isFinite(pace) ||
        pace < 120 ||
        pace > 1200 ||
        !Number.isFinite(actualCadence) ||
        actualCadence < 30 ||
        actualCadence > 300)) ||
    ![
      latitude,
      longitude,
      distanceM,
      durationS,
      steps,
      laps,
      actualStart,
    ].every(Number.isFinite) ||
    Math.abs(latitude) > 85 ||
    Math.abs(longitude) > 179 ||
    distanceM < 100 ||
    distanceM > 30000 ||
    durationS < 60 ||
    durationS > 7200 ||
    steps < 1 ||
    steps > 50000 ||
    laps < 1 ||
    laps > 10 ||
    distanceM / durationS < 0.5 ||
    distanceM / durationS > 12 ||
    (steps * 60) / durationS < 30 ||
    (steps * 60) / durationS > 300 ||
    distanceM / steps < 0.2 ||
    distanceM / steps > 3 ||
    durationS < laps * 10
  )
    throw new Error('本次偏移超出了有效范围，请调整基准值或缩小偏移。');
  return {
    ...(pace === undefined
      ? {}
      : {
          targetPaceSecondsPerKm: pace,
          estimatedCadence: actualCadence,
        }),
    ...(config.route?.length ? { route: structuredClone(config.route) } : {}),
    seed,
    startTime: actualStart,
    latitude,
    longitude,
    distanceM,
    durationS,
    steps,
    laps,
  };
}
export function localDateTime(time: number): string {
  const d = new Date(time);
  return new Date(time - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19);
}

export function paceConfig(config: StudioConfig): StudioConfig {
  const paceSecondsPerKm =
    config.paceSecondsPerKm ??
    Math.round((config.durationS * 1000) / config.distanceM);
  const cadence = config.cadence ?? 160;
  const durationS = Math.round((config.distanceM / 1000) * paceSecondsPerKm);
  return {
    ...config,
    route: config.route ?? [],
    paceSecondsPerKm,
    cadence,
    cadenceOffset: config.cadenceOffset ?? [-3, 3],
    durationS,
    steps: Math.round((durationS / 60) * cadence),
    laps: 1,
    offsets: {
      ...config.offsets,
      steps: [0, 0],
      laps: [0, 0],
      positionM: [0, 0],
    },
  };
}
