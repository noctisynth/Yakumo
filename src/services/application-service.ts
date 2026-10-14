import { invoke, isTauri } from '@tauri-apps/api/core';
import type { ApplicationInfo, RuntimeInfo } from '@/models/application-info';
import { version } from '../../package.json';

export async function readApplicationInfo(): Promise<RuntimeInfo> {
  if (!isTauri()) {
    return { name: '八云爱', version, runtime: 'browser' };
  }

  const info = await invoke<ApplicationInfo>('get_application_info');
  return { ...info, runtime: 'native' };
}
