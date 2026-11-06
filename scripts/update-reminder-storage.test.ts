import { describe, expect, test } from 'bun:test';
import { createUpdateReminderStorage } from '../src/services/update-reminder-storage';

const key = 'yakumo.skipped-update-versions';

function setup(initial: string | null = null) {
  const values = new Map<string, string>();
  if (initial !== null) values.set(key, initial);
  const storage = {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => {
      values.set(name, value);
    },
  };
  return {
    values,
    storage,
    reminders: createUpdateReminderStorage(() => storage),
  };
}

describe('update reminder storage', () => {
  test('only the skipped version list is persisted and can be read by a new instance', () => {
    const run = setup();
    run.reminders.write(['1.2.3', '1.3.0']);
    expect([...run.values.keys()]).toEqual([key]);
    expect(JSON.parse(run.values.get(key) ?? '')).toEqual(['1.2.3', '1.3.0']);
    const restarted = createUpdateReminderStorage(() => run.storage);
    expect(restarted.read()).toEqual(['1.2.3', '1.3.0']);
  });

  test('empty, malformed and non-array values are ignored', () => {
    for (const value of [
      null,
      '',
      '{',
      'null',
      'true',
      '12',
      '{}',
      '"1.2.3"',
    ]) {
      expect(setup(value).reminders.read()).toEqual([]);
    }
  });

  test('reads only unique stable version strings from mixed stored data', () => {
    const run = setup(
      JSON.stringify([
        '1.2.3',
        123,
        null,
        {},
        ['1.2.4'],
        '1.2.3',
        '1.3.0',
        'v1.2.4',
        '1.2',
        '1.2.3.4',
        '1.2.3-beta.1',
        ' 1.2.3',
        '1.2.3 ',
      ]),
    );
    expect(run.reminders.read()).toEqual(['1.2.3', '1.3.0']);
  });

  test('unavailable storage or a failed read acts like an empty preference', () => {
    const unavailable = createUpdateReminderStorage(() => {
      throw new Error('storage access denied');
    });
    expect(unavailable.read()).toEqual([]);
    const run = setup();
    run.storage.getItem = () => {
      throw new Error('storage read failed');
    };
    expect(run.reminders.read()).toEqual([]);
  });

  test('write failures propagate so the interface does not claim the skip was saved', () => {
    const unavailable = createUpdateReminderStorage(() => {
      throw new Error('storage access denied');
    });
    expect(() => unavailable.write(['1.2.3'])).toThrow();
    const run = setup('["1.2.3"]');
    run.storage.setItem = () => {
      throw new Error('storage quota exceeded');
    };
    expect(() => run.reminders.write(['1.2.3', '1.3.0'])).toThrow();
    expect(run.reminders.read()).toEqual(['1.2.3']);
  });
});
