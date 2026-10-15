import { expect, test } from 'bun:test';
import { sampleRun } from '../src/lib/studio-sampling';
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
