import { invoke, isTauri } from '@tauri-apps/api/core';
import { Update } from '@tauri-apps/plugin-updater';
import { version } from '../../package.json';

export interface UpdateStatus {
  supported: boolean;
  configured: boolean;
  version: string;
  platform: string;
}

export const updateService = {
  status: (): Promise<UpdateStatus> =>
    isTauri()
      ? invoke('update_status')
      : Promise.resolve({
          supported: false,
          configured: false,
          version,
          platform: 'browser',
        }),
  check: async (): Promise<Update | null> => {
    const metadata = await invoke<
      ConstructorParameters<typeof Update>[0] | null
    >('check_application_update');
    return metadata ? new Update(metadata) : null;
  },
  restart: () => invoke<void>('restart_after_update'),
};

export function updateError(value: unknown, installing = false): string {
  const code =
    typeof value === 'object' && value !== null && 'code' in value
      ? String(value.code)
      : '';
  const text =
    typeof value === 'string'
      ? value
      : value instanceof Error
        ? value.message
        : '';
  if (code === 'cancelled' || text.includes('UPDATE_CANCELLED'))
    return '下载已取消。重新检查更新后可以重试。';
  if (text.includes('INSTALL_PERMISSION_DENIED'))
    return '尚未允许此应用安装更新。请允许安装来源后重试。';
  if (text.includes('INSTALL_CANCELLED'))
    return '已取消系统安装。可以再次点击安装。';
  if (
    text.includes('APK_') ||
    /signature|signed|Minisign|base64|verify|verification/i.test(text) ||
    code === 'verification'
  )
    return '安装包安全检查失败，已停止更新。请联系维护者。';
  if (code === 'platform') return '尚未提供当前平台的更新包，请稍后重试。';
  if (code === 'not_configured')
    return '当前版本无法使用应用内更新，请从官方发布页安装新版。';
  if (code === 'manifest') return '更新信息异常，已停止更新。请联系维护者。';
  return installing
    ? '安装未完成。请检查系统提示、可用空间与安装权限后重试。'
    : '更新连接失败或超时。请检查网络后重新检查更新。';
}
