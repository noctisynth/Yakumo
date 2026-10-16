import { expect, test } from 'bun:test';
import {
  createMapLoadMonitor,
  type MapLoadState,
} from '../src/lib/map-loading';
import { mapProviders } from '../src/lib/map-providers';

test('map providers require a project key and use fixed HTTPS tile hosts', () => {
  expect(mapProviders().map((provider) => provider.id)).toEqual(['osm']);
  const providers = mapProviders('0'.repeat(32));
  expect(providers.map((provider) => provider.id)).toEqual(['tianditu', 'osm']);
  expect(providers[0].tiles).toHaveLength(2);
  for (const template of providers[0].tiles) {
    const url = new URL(
      template.replace('{z}', '12').replace('{x}', '1').replace('{y}', '2'),
    );
    expect(url.origin).toBe('https://t0.tianditu.gov.cn');
    expect(url.searchParams.get('TILEMATRIXSET')).toBe('w');
    expect(url.searchParams.get('TILEMATRIX')).toBe('12');
    expect(url.searchParams.get('TILEROW')).toBe('2');
    expect(url.searchParams.get('TILECOL')).toBe('1');
  }
  expect(() => mapProviders('invalid&tk=other')).toThrow();
});

function fixture() {
  let now = 0;
  let latest: MapLoadState | undefined;
  const tasks = new Map<number, () => void>();
  const monitor = createMapLoadMonitor(
    (state) => {
      latest = state;
    },
    (callback, delay) => {
      const deadline = now + delay;
      tasks.set(deadline, callback);
      return () => {
        tasks.delete(deadline);
      };
    },
  );
  return {
    monitor,
    state: () => latest,
    advance(ms: number) {
      now += ms;
      for (const [deadline, callback] of tasks) {
        if (deadline <= now) {
          tasks.delete(deadline);
          callback();
        }
      }
    },
  };
}

test('slow tiles have a bounded deadline despite repeated loading events', () => {
  const f = fixture();
  f.monitor.start();
  f.advance(10_000);
  f.monitor.start();
  f.advance(5_000);
  expect(f.state()).toEqual({
    loading: false,
    hasTiles: false,
    error: 'timeout',
  });
  f.monitor.start();
  expect(f.state()?.loading).toBe(false);
  f.monitor.tileLoaded();
  f.monitor.complete();
  expect(f.state()).toEqual({ loading: false, hasTiles: true, error: null });
});

test('failed or empty batches never become a blank successful map', () => {
  for (const failure of [false, true]) {
    const f = fixture();
    f.monitor.start();
    if (failure) f.monitor.tileFailed();
    f.monitor.complete();
    expect(f.state()).toEqual({
      loading: false,
      hasTiles: false,
      error: 'unavailable',
    });
    f.advance(15_000);
    expect(f.state()?.error).toBe('unavailable');
  }
});

test('partial failures preserve the visible map and a later batch recovers', () => {
  const f = fixture();
  f.monitor.start();
  f.monitor.tileLoaded();
  f.monitor.tileFailed();
  f.monitor.complete();
  expect(f.state()).toEqual({
    loading: false,
    hasTiles: true,
    error: 'unavailable',
  });
  f.monitor.start();
  f.monitor.tileLoaded();
  f.monitor.complete();
  expect(f.state()?.error).toBeNull();
});

test('replaced layers cannot update state through late events or timers', () => {
  const f = fixture();
  f.monitor.start();
  f.monitor.dispose();
  const state = f.state();
  f.monitor.tileFailed();
  f.monitor.tileLoaded();
  f.monitor.complete();
  f.monitor.start();
  f.advance(30_000);
  expect(f.state()).toBe(state);
});
