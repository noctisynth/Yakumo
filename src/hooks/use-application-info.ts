import { useEffect, useState } from 'react';

import type { RuntimeInfo } from '@/models/application-info';
import { readApplicationInfo } from '@/services/application-service';

export function useApplicationInfo() {
  const [info, setInfo] = useState<RuntimeInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    readApplicationInfo().then(
      (result) => {
        if (active) setInfo(result);
      },
      () => {
        if (active) setError('暂时无法读取应用信息');
      },
    );

    return () => {
      active = false;
    };
  }, []);

  return { info, error };
}
