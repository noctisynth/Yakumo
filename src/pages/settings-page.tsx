import { Monitor, Moon, RotateCcw, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { UpdateCard } from '@/components/update-card';
import type { ThemePreference } from '@/models/preferences';
import { usePreferencesStore } from '@/stores/preferences-store';

const themes: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
];

export function SettingsPage() {
  const { theme, compact, setTheme, setCompact, reset } = usePreferencesStore();

  return (
    <div className='max-w-3xl space-y-8'>
      <div>
        <p className='mb-3 text-[10px] font-medium tracking-[0.2em] text-primary uppercase'>
          make yourself at home
        </p>
        <h1 className='text-3xl font-semibold tracking-tight'>偏好设置</h1>
        <p className='mt-3 text-sm leading-7 text-muted-foreground'>
          让这个空间更合你的心意。设置在本次打开期间生效。
        </p>
      </div>
      <Card className='rounded-2xl border-border/70 shadow-none'>
        <CardHeader>
          <CardTitle>外观</CardTitle>
          <CardDescription>选择舒服的明暗，随时可以切换。</CardDescription>
        </CardHeader>
        <CardContent className='space-y-8'>
          <fieldset className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
            <legend className='sr-only'>主题</legend>
            {themes.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                variant={theme === value ? 'default' : 'outline'}
                aria-pressed={theme === value}
                onClick={() => setTheme(value)}
                className='h-20 flex-col gap-2 rounded-xl'
              >
                <Icon className='size-5' aria-hidden='true' />
                {label}
              </Button>
            ))}
          </fieldset>
          <div className='flex items-center justify-between gap-5 border-t pt-6'>
            <div>
              <label htmlFor='compact-layout' className='text-sm font-medium'>
                紧凑布局
              </label>
              <p
                id='compact-description'
                className='mt-2 text-xs leading-6 text-muted-foreground'
              >
                减少内容区域的上下留白。
              </p>
            </div>
            <Switch
              id='compact-layout'
              checked={compact}
              onCheckedChange={setCompact}
              aria-describedby='compact-description'
            />
          </div>
        </CardContent>
      </Card>
      <UpdateCard />
      <Button variant='outline' onClick={reset} className='rounded-xl'>
        <RotateCcw className='size-4' aria-hidden='true' />
        恢复默认设置
      </Button>
    </div>
  );
}
