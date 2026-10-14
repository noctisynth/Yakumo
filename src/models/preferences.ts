export type ThemePreference = 'system' | 'light' | 'dark';

export interface Preferences {
  theme: ThemePreference;
  compact: boolean;
}
