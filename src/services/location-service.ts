import { invoke, isTauri } from '@tauri-apps/api/core';

export interface QueryLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}

// Called only by the explicit location button; never run during initialization.
export async function requestQueryLocation(): Promise<QueryLocation> {
  let position: { coords: QueryLocation };
  if (isTauri() && (await invoke<boolean>('mobile_platform'))) {
    const { checkPermissions, requestPermissions, getCurrentPosition } =
      await import('@tauri-apps/plugin-geolocation');
    let permission = await checkPermissions();
    if (permission.coarseLocation !== 'granted')
      permission = await requestPermissions(['coarseLocation']);
    if (permission.coarseLocation !== 'granted')
      throw new Error('未获得定位权限，你仍可手动输入坐标。');
    position = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('获取位置超时，请重试或手动输入坐标。')),
        20000,
      );
      getCurrentPosition({
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 0,
      })
        .then(resolve, reject)
        .finally(() => clearTimeout(timer));
    });
  } else {
    if (!navigator.geolocation)
      throw new Error('此设备暂不支持定位，请手动输入坐标。');
    position = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 0,
      }),
    );
  }
  const { latitude, longitude, accuracy } = position.coords;
  if (
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 90 ||
    !Number.isFinite(longitude) ||
    Math.abs(longitude) > 180 ||
    !Number.isFinite(accuracy) ||
    accuracy < 0
  )
    throw new Error('未能获取有效位置，请重试或手动输入坐标。');
  return { latitude, longitude, accuracy };
}

export function locationError(error: unknown): string {
  if (
    error instanceof Error &&
    [
      '未获得定位权限，你仍可手动输入坐标。',
      '获取位置超时，请重试或手动输入坐标。',
      '此设备暂不支持定位，请手动输入坐标。',
      '未能获取有效位置，请重试或手动输入坐标。',
    ].includes(error.message)
  )
    return error.message;
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? error.code
      : null;
  if (code === 1) return '未获得定位权限，你仍可手动输入坐标。';
  if (code === 3) return '获取位置超时，请重试或手动输入坐标。';
  return '无法获取当前位置，请确认系统定位已开启，或手动输入坐标。';
}
