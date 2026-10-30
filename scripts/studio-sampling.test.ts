import { expect, test } from 'bun:test';
import { routeLength } from '../src/lib/route-geometry';
import { hasFastPaceRisk, validDerivedPace } from '../src/lib/run-pace';
import { paceConfig, sampleRun } from '../src/lib/studio-sampling';
import { defaultConfig } from '../src/models/studio';

test('bounded sampling is reproducible and preserves integral counters', () => {
  const config = { ...defaultConfig(), latitude: 0, longitude: 0 };
  for (let n = 0; n < 100; n++) {
    const seed = `synthetic-${n}`;
    const a = sampleRun(config, 1700000000000, seed);
    expect(a).toEqual(sampleRun(config, 1700000000000, seed));
    expect(a.distanceM).toBeGreaterThanOrEqual(1970);
    expect(a.distanceM).toBeLessThanOrEqual(2030);
    expect(a.durationS).toBeGreaterThanOrEqual(885);
    expect(a.durationS).toBeLessThanOrEqual(915);
    expect(
      Number.isInteger(a.steps) &&
        Number.isInteger(a.durationS) &&
        Number.isInteger(a.laps),
    ).toBe(true);
    expect(a.steps).toBeGreaterThanOrEqual(2350);
    expect(a.steps).toBeLessThanOrEqual(2450);
  }
  expect(sampleRun(config, 1700000000000, 'a')).not.toEqual(
    sampleRun(config, 1700000000000, 'b'),
  );
});
test('zero offsets preserve base values; bad ranges and inconsistent inputs fail', () => {
  const c = { ...defaultConfig(), latitude: 0, longitude: 0 };
  for (const key of Object.keys(c.offsets) as (keyof typeof c.offsets)[])
    c.offsets[key] = [0, 0];
  const a = sampleRun(c, 1700000000000, 'same');
  expect(a.distanceM).toBe(2000);
  expect(a.steps).toBe(2400);
  expect(a.latitude).toBe(0);
  expect(a.startTime).toBe(1700000000000);
  expect(() =>
    sampleRun({ ...c, durationS: 1 }, 1700000000000, 'same'),
  ).toThrow();
  expect(() =>
    sampleRun({ ...c, latitude: null }, 1700000000000, 'same'),
  ).toThrow();
  c.offsets.distanceM = [5, -5];
  expect(() => sampleRun(c, 1700000000000, 'same')).toThrow();
});

test('route sampling preserves selected geometry rather than translating it', () => {
  const c = {
    ...defaultConfig(),
    closeLoop: false,
    latitude: 0,
    longitude: 0,
    route: [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0.002 },
    ],
  };
  c.offsets.positionM = [-100, 100];
  c.offsets.laps = [-3, 3];
  for (let n = 0; n < 20; n++) {
    const sample = sampleRun(c, 1700000000000, `route-${n}`);
    expect(sample.route).toEqual(c.route);
    expect(sample.route).not.toBe(c.route);
    expect(sample.latitude).toBe(0);
    expect(sample.longitude).toBe(0);
    expect(sample.laps).toBe(1);
  }
  expect(() =>
    sampleRun({ ...c, route: c.route.slice(0, 1) }, 1700000000000, 'bad'),
  ).toThrow();
});

test('pace and distance jointly determine time, speed and estimated steps', () => {
  const config = paceConfig({
    ...defaultConfig(),
    closeLoop: false,
    latitude: 0,
    longitude: 0,
    route: [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0.002 },
    ],
    paceSecondsPerKm: 360,
    cadence: 160,
  });
  expect(config.durationS).toBe(720);
  expect(config.steps).toBe(1920);
  for (let n = 0; n < 100; n++) {
    const value = sampleRun(config, 1700000000000, `pace-${n}`);
    const actualPace = (value.durationS / value.distanceM) * 1000;
    expect(actualPace).toBeGreaterThanOrEqual(344);
    expect(actualPace).toBeLessThanOrEqual(376);
    expect(value.steps).toBe(
      Math.round((value.durationS / 60) * (value.estimatedCadence ?? 160)),
    );
    expect(value.durationS).toBeGreaterThan(0);
  }
  expect(paceConfig({ ...config, distanceM: 3000 }).steps).toBe(2880);
  expect(() =>
    sampleRun({ ...config, paceSecondsPerKm: 0 }, 1700000000000, 'bad'),
  ).toThrow();
  expect(() =>
    sampleRun({ ...config, cadence: NaN }, 1700000000000, 'bad'),
  ).toThrow();
});

test('one preset varies between seeds while zero ranges preserve final metrics', () => {
  const config = paceConfig({
    ...defaultConfig(),
    closeLoop: false,
    latitude: 0,
    longitude: 0,
    route: [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0.002 },
    ],
  });
  const samples = Array.from({ length: 30 }, (_, i) =>
    sampleRun(config, 1700000000000, `different-${i}`),
  );
  expect(
    new Set(
      samples.map((v) => JSON.stringify([v.distanceM, v.durationS, v.steps])),
    ).size,
  ).toBeGreaterThan(20);
  expect(new Set(samples.map((v) => v.estimatedCadence)).size).toBeGreaterThan(
    1,
  );
  for (const key of Object.keys(
    config.offsets,
  ) as (keyof typeof config.offsets)[])
    config.offsets[key] = [0, 0];
  config.cadenceOffset = [0, 0];
  const a = sampleRun(config, 1700000000000, 'a'),
    b = sampleRun(config, 1700000000000, 'b');
  expect([a.distanceM, a.durationS, a.steps, a.estimatedCadence]).toEqual([
    b.distanceM,
    b.durationS,
    b.steps,
    b.estimatedCadence,
  ]);
});

test('coordinate variation is included in the exact generation input', () => {
  const c = paceConfig({
    ...defaultConfig(),
    closeLoop: false,
    latitude: 0,
    longitude: 0,
    route: [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0.002 },
    ],
  });
  expect(sampleRun(c, 1700000000000, 'noise').coordinateNoiseM).toBe(0.8);
  expect(
    sampleRun({ ...c, coordinateNoiseM: 0 }, 1700000000000, 'noise')
      .coordinateNoiseM,
  ).toBe(0);
  expect(() =>
    sampleRun({ ...c, coordinateNoiseM: NaN }, 1700000000000, 'noise'),
  ).toThrow();
  expect(() =>
    sampleRun({ ...c, coordinateNoiseM: 4 }, 1700000000000, 'noise'),
  ).toThrow();
});

test('loop preference is preserved and requires three selected points', () => {
  const c = paceConfig({
    ...defaultConfig(),
    latitude: 0,
    longitude: 0,
    closeLoop: true,
    route: [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0.002 },
      { latitude: 0.002, longitude: 0.002 },
    ],
  });
  expect(sampleRun(c, 1700000000000, 'loop').closeLoop).toBe(true);
  expect(() =>
    sampleRun({ ...c, route: c.route?.slice(0, 2) }, 1700000000000, 'loop'),
  ).toThrow();
});

test('new routes default to a loop and default mileage follows the selected geometry', () => {
  expect(paceConfig(defaultConfig()).closeLoop).toBe(true);
  expect(paceConfig({ ...defaultConfig(), closeLoop: false }).closeLoop).toBe(
    false,
  );
  const points = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 0.001 },
    { latitude: 0, longitude: 0.002 },
  ];
  expect(routeLength(points, false)).toBe(222.4);
  expect(routeLength(points, true)).toBe(444.8);
  expect(routeLength([...points, points[0]], true)).toBe(444.8);
  expect(routeLength([], true)).toBe(0);
  expect(routeLength(points.slice(0, 1), false)).toBe(0);
});

test('pace safety covers base values, offset endpoints and legacy inputs', () => {
  const base = {
    ...defaultConfig(),
    closeLoop: false,
    latitude: 0,
    longitude: 0,
  };
  for (const key of Object.keys(base.offsets) as (keyof typeof base.offsets)[])
    base.offsets[key] = [0, 0];
  for (const pace of [180, 900]) {
    const config = paceConfig({
      ...base,
      paceSecondsPerKm: pace,
      cadence: 120,
      cadenceOffset: [0, 0],
    });
    expect(
      sampleRun(config, 1700000000000, 'boundary').targetPaceSecondsPerKm,
    ).toBe(pace);
    config.offsets.durationS = pace === 180 ? [-1, 0] : [0, 1];
    expect(() => sampleRun(config, 1700000000000, 'boundary')).toThrow(
      '3 至 15',
    );
  }
  for (const pace of [120, 179, 901, 1200]) {
    const config = paceConfig({ ...base, paceSecondsPerKm: pace });
    expect(() => sampleRun(config, 1700000000000, 'bad')).toThrow('3 至 15');
    expect(() =>
      sampleRun({ ...base, durationS: pace * 2 }, 1700000000000, 'legacy'),
    ).toThrow('3 至 15');
  }
  expect(validDerivedPace(1000, 179)).toBe(false);
  expect(validDerivedPace(1000, 901)).toBe(false);
  expect(validDerivedPace(100.1, 90)).toBe(true);
});

test('fast pace is advisory for all distances and equality does not warn', () => {
  for (const distance of [100, 1000, 3000, 10000]) {
    const duration = (distance / 1000) * 300;
    expect(hasFastPaceRisk(distance, duration - 1)).toBe(true);
    expect(hasFastPaceRisk(distance, duration)).toBe(false);
    expect(hasFastPaceRisk(distance, duration + 1)).toBe(false);
    expect(hasFastPaceRisk(distance - 0.000001, duration)).toBe(false);
  }
});
