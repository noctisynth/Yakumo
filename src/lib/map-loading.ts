export type MapLoadState = {
  loading: boolean;
  hasTiles: boolean;
  error: 'timeout' | 'unavailable' | null;
};

type Schedule = (callback: () => void, delay: number) => () => void;

/** One deadline per tile batch, even if the map emits repeated loading events. */
export function createMapLoadMonitor(
  notify: (state: MapLoadState) => void,
  schedule: Schedule = (callback, delay) => {
    const timer = setTimeout(callback, delay);
    return () => clearTimeout(timer);
  },
) {
  let state: MapLoadState = { loading: false, hasTiles: false, error: null };
  let active = false;
  let disposed = false;
  let loaded = false;
  let failed = false;
  let cancel: (() => void) | undefined;
  const update = (patch: Partial<MapLoadState>) => {
    if (disposed) return;
    state = { ...state, ...patch };
    notify(state);
  };
  return {
    start() {
      if (disposed || active) return;
      active = true;
      loaded = false;
      failed = false;
      update({ loading: true, error: null });
      cancel = schedule(() => {
        update({ loading: false, error: 'timeout' });
      }, 15_000);
    },
    tileLoaded() {
      if (disposed) return;
      loaded = true;
      update({ hasTiles: true, error: failed ? 'unavailable' : null });
    },
    tileFailed() {
      if (disposed) return;
      failed = true;
      update({ error: 'unavailable' });
    },
    complete() {
      if (disposed) return;
      cancel?.();
      active = false;
      update({
        loading: false,
        error: failed || !loaded ? 'unavailable' : null,
      });
    },
    dispose() {
      disposed = true;
      cancel?.();
    },
  };
}
