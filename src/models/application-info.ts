export interface ApplicationInfo {
  name: string;
  version: string;
}

export interface RuntimeInfo extends ApplicationInfo {
  runtime: 'browser' | 'native';
}
