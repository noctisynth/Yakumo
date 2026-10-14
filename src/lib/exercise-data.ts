import type { DataObject, JsonValue } from '@/models/exercise';

export function object(value: JsonValue | undefined): DataObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

export function items(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}
export function text(value: JsonValue | undefined, fallback = '—'): string {
  return (typeof value === 'string' && value.trim() !== '') ||
    typeof value === 'number'
    ? String(value)
    : fallback;
}
export function numeric(value: JsonValue | undefined): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  if (
    typeof value === 'string' &&
    !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())
  )
    return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}
export function quantity(value: JsonValue | undefined, digits = 2): string {
  const result = numeric(value);
  return result === null
    ? '—'
    : result.toLocaleString('zh-CN', { maximumFractionDigits: digits });
}
export function duration(value: JsonValue | undefined): string {
  const seconds = numeric(value);
  if (seconds === null || seconds < 0) return '—';
  return `${Math.floor(seconds / 60)} 分 ${Math.floor(seconds % 60)} 秒`;
}
export function recordStatus(value: JsonValue | undefined): string {
  const status = text(value, '');
  return status === '1'
    ? '合格'
    : status === '0'
      ? '未合格'
      : status
        ? `状态 ${status}`
        : '状态未知';
}
