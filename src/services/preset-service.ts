import { invoke } from '@tauri-apps/api/core';
import type { StudioConfig, StudioPreset } from '@/models/studio';

type PresetAction =
  | { kind: 'list' }
  | { kind: 'save'; id?: string; name: string; config: StudioConfig }
  | { kind: 'remove'; id: string };
export const editPresets = (accountId: string, action: PresetAction) =>
  invoke<StudioPreset[]>('studio_presets', { accountId, action });
export const presetError = (e: unknown) =>
  typeof e === 'object' &&
  e !== null &&
  'message' in e &&
  typeof e.message === 'string'
    ? e.message
    : '预设操作失败，请重试。';
