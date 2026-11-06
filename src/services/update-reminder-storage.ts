const storageKey = 'yakumo.skipped-update-versions';

export function createUpdateReminderStorage(
  getStorage: () => Pick<Storage, 'getItem' | 'setItem'> = () =>
    window.localStorage,
) {
  return {
    read: (): string[] => {
      try {
        const value: unknown = JSON.parse(
          getStorage().getItem(storageKey) ?? '[]',
        );
        if (!Array.isArray(value)) return [];
        return [
          ...new Set(
            value.filter(
              (version): version is string =>
                typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version),
            ),
          ),
        ];
      } catch {
        // A missing or damaged preference must not block the update check.
        return [];
      }
    },
    write: (versions: string[]) => {
      getStorage().setItem(storageKey, JSON.stringify(versions));
    },
  };
}

export const updateReminderStorage = createUpdateReminderStorage();
