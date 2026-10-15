import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { zhCN } from 'react-day-picker/locale';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { localDateTime } from '@/lib/studio-sampling';
export function DateTimePicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const parsed = new Date(value);
  const date = Number.isFinite(parsed.getTime()) ? parsed : new Date();
  const time = [date.getHours(), date.getMinutes(), date.getSeconds()];
  return (
    <div className='flex flex-wrap items-center gap-3'>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type='button'
            variant='outline'
            disabled={disabled}
            aria-label='选择起始日期'
            className='h-10 justify-start gap-3 text-foreground'
          >
            <CalendarDays className='size-4 text-muted-foreground' />
            {date.toLocaleDateString('zh-CN')}
          </Button>
        </PopoverTrigger>
        <PopoverContent align='start' className='w-auto p-0'>
          <Calendar
            mode='single'
            disabled={disabled}
            selected={date}
            locale={zhCN}
            onSelect={(day) => {
              if (!day) return;
              const next = new Date(day);
              next.setHours(...(time as [number, number, number]));
              onChange(localDateTime(next.getTime()));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      <div className='flex items-center gap-2'>
        {(['小时', '分钟', '秒'] as const).map((label, i) => (
          <div key={label} className='flex items-center gap-2'>
            <Input
              type='number'
              inputMode='numeric'
              aria-label={`起始${label}`}
              min={0}
              max={i === 0 ? 23 : 59}
              step={1}
              required
              disabled={disabled}
              className='w-16 text-center tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none'
              value={String(time[i]).padStart(2, '0')}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isInteger(n) || n < 0 || n > (i === 0 ? 23 : 59))
                  return;
                const next = new Date(date);
                if (i === 0) next.setHours(n);
                else if (i === 1) next.setMinutes(n);
                else next.setSeconds(n);
                onChange(localDateTime(next.getTime()));
              }}
            />
            {i < 2 && (
              <span aria-hidden='true' className='text-muted-foreground'>
                :
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
