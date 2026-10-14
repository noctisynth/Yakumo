import { invoke, isTauri } from '@tauri-apps/api/core';
import type { ExerciseQuery, ExerciseResponse } from '@/models/exercise';

export async function readExercise(
  accountId: string,
  query: ExerciseQuery,
): Promise<ExerciseResponse> {
  if (!isTauri())
    throw { code: 'native_required', message: '请在桌面应用中读取学校数据。' };
  return invoke<ExerciseResponse>('read_exercise', { accountId, query });
}
