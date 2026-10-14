import { describe, expect, test } from 'bun:test';
import { duration, numeric, recordStatus } from '@/lib/exercise-data';
import type { ExerciseQuery, ExerciseResponse } from '@/models/exercise';
import { createDashboardStore } from '@/stores/dashboard-store';

describe('dashboard isolation and request ordering', () => {
  test('drops late account responses and lets the latest filter win', async () => {
    const pending: ((response: ExerciseResponse) => void)[] = [];
    const store = createDashboardStore(
      async () =>
        new Promise<ExerciseResponse>((resolve) => {
          pending.push(resolve);
        }),
    );
    store.getState().activate('synthetic-a');
    const first = store.getState().read('summary', { kind: 'summary' });
    store.getState().activate('synthetic-b');
    pending[0]({
      accountId: 'synthetic-a',
      fetchedAt: 100,
      data: { secretAccountData: 'old' },
    });
    await first;
    expect(store.getState().summary.data).toBeNull();
    const oldFilter = store
      .getState()
      .recordsPage({ status: '1', page: 1, date: '' });
    const newFilter = store
      .getState()
      .recordsPage({ status: '0', page: 1, date: '' });
    pending[2]({
      accountId: 'synthetic-b',
      fetchedAt: 300,
      data: { records: [], marker: 'latest' },
    });
    await newFilter;
    pending[1]({
      accountId: 'synthetic-b',
      fetchedAt: 200,
      data: { marker: 'old' },
    });
    await oldFilter;
    expect(store.getState().records.data).toEqual({
      records: [],
      marker: 'latest',
    });
    expect(store.getState().records.loading).toBe(false);
    expect(store.getState().filter.status).toBe('0');
  });

  test('partial failures preserve successful resources and same-query cached data', async () => {
    let reject = false;
    const service = async (
      accountId: string,
      query: ExerciseQuery,
    ): Promise<ExerciseResponse> => {
      if (query.kind === 'statistics' || reject)
        throw {
          code: 'invalid_response',
          message: '合成错误。',
          httpStatus: 200,
        };
      return {
        accountId,
        fetchedAt: 100,
        data: query.kind === 'summary' ? { succeed: '2' } : { records: [] },
      };
    };
    const store = createDashboardStore(service);
    store.getState().activate('synthetic-a');
    await store.getState().overview();
    expect(store.getState().summary.data).toEqual({ succeed: '2' });
    expect(store.getState().statistics.error?.code).toBe('invalid_response');
    expect(store.getState().records.data).toEqual({ records: [] });
    reject = true;
    await store.getState().overview();
    expect(store.getState().summary.data).toEqual({ succeed: '2' });
    expect(store.getState().summary.error?.httpStatus).toBe(200);
    store.getState().activate(null);
    expect(store.getState().summary.data).toBeNull();
    expect(store.getState().records.data).toBeNull();
  });

  test('unknown values remain unknown and numeric strings are handled without boolean coercion', () => {
    expect(numeric(null)).toBeNull();
    expect(numeric('')).toBeNull();
    expect(numeric('0x12')).toBeNull();
    expect(numeric(false)).toBeNull();
    expect(numeric('2.020')).toBe(2.02);
    expect(numeric(0)).toBe(0);
    expect(duration('899')).toBe('14 分 59 秒');
    expect(recordStatus('1')).toBe('合格');
    expect(recordStatus('7')).toBe('状态 7');
    expect(recordStatus(null)).toBe('状态未知');
  });
});
