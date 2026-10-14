import { create } from 'zustand';
import type {
  DataResource,
  DataSection,
  ExerciseError,
  ExerciseQuery,
  RecordFilter,
} from '@/models/exercise';
import { readExercise } from '@/services/exercise-service';

const empty = (): DataResource => ({
  data: null,
  loading: false,
  error: null,
  updatedAt: null,
});
const resources = () => ({
  profile: empty(),
  summary: empty(),
  statistics: empty(),
  records: empty(),
  detail: empty(),
  settings: empty(),
});

interface DashboardState {
  accountId: string | null;
  detailId: string | null;
  profile: DataResource;
  summary: DataResource;
  statistics: DataResource;
  records: DataResource;
  detail: DataResource;
  settings: DataResource;
  filter: RecordFilter;
  activate: (accountId: string | null) => void;
  overview: () => Promise<void>;
  read: (section: DataSection, query: ExerciseQuery) => Promise<void>;
  recordsPage: (filter: RecordFilter) => Promise<void>;
}

export function createDashboardStore(service = readExercise) {
  let generation = 0;
  const requests = new Map<DataSection, number>();
  return create<DashboardState>((set, get) => ({
    accountId: null,
    detailId: null,
    ...resources(),
    filter: { status: '1', page: 1, date: '' },
    activate: (accountId) => {
      if (get().accountId === accountId) return;
      generation += 1;
      set({
        accountId,
        detailId: null,
        ...resources(),
        filter: { status: '1', page: 1, date: '' },
      });
    },
    read: async (section, query) => {
      const accountId = get().accountId;
      if (!accountId) return;
      const current = generation;
      const sequence = (requests.get(section) ?? 0) + 1;
      requests.set(section, sequence);
      set({
        ...(query.kind === 'detail' ? { detailId: query.id } : {}),
        [section]: {
          ...get()[section],
          ...(section === 'detail' ? { data: null, updatedAt: null } : {}),
          loading: true,
          error: null,
        },
      });
      try {
        const response = await service(accountId, query);
        if (
          generation !== current ||
          requests.get(section) !== sequence ||
          get().accountId !== response.accountId
        )
          return;
        set({
          [section]: {
            data: response.data,
            loading: false,
            error: null,
            updatedAt: response.fetchedAt,
          },
        });
      } catch (failure) {
        if (generation !== current || requests.get(section) !== sequence)
          return;
        const error: ExerciseError =
          typeof failure === 'object' &&
          failure !== null &&
          'code' in failure &&
          'message' in failure &&
          typeof failure.code === 'string' &&
          typeof failure.message === 'string'
            ? {
                code: failure.code,
                message: failure.message,
                ...('httpStatus' in failure &&
                typeof failure.httpStatus === 'number'
                  ? { httpStatus: failure.httpStatus }
                  : {}),
                ...('businessCode' in failure &&
                typeof failure.businessCode === 'number'
                  ? { businessCode: failure.businessCode }
                  : {}),
              }
            : { code: 'unknown_error', message: '读取未能完成，请重试。' };
        set({ [section]: { ...get()[section], loading: false, error } });
      }
    },
    overview: async () => {
      await Promise.all([
        get().read('summary', { kind: 'summary' }),
        get().read('statistics', { kind: 'statistics' }),
        get().read('records', { kind: 'records', ...get().filter }),
      ]);
    },
    recordsPage: async (filter) => {
      const changed = JSON.stringify(filter) !== JSON.stringify(get().filter);
      set({ filter, ...(changed ? { records: empty() } : {}) });
      await get().read('records', { kind: 'records', ...filter });
    },
  }));
}

export const useDashboardStore = createDashboardStore();
