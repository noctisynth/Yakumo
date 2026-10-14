export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export type DataObject = { [key: string]: JsonValue };
export type ExerciseQuery =
  | { kind: 'profile' | 'summary' | 'statistics' }
  | { kind: 'records'; status: string; page: number; date: string }
  | { kind: 'detail'; id: string }
  | { kind: 'settings'; latitude: number; longitude: number; runType: number };
export interface ExerciseResponse {
  accountId: string;
  fetchedAt: number;
  data: JsonValue;
}
export interface ExerciseError {
  code: string;
  message: string;
  httpStatus?: number | null;
  businessCode?: number | null;
}
export interface DataResource {
  data: JsonValue;
  loading: boolean;
  error: ExerciseError | null;
  updatedAt: number | null;
}
export type DataSection =
  | 'profile'
  | 'summary'
  | 'statistics'
  | 'records'
  | 'detail'
  | 'settings';
export interface RecordFilter {
  status: string;
  page: number;
  date: string;
}
