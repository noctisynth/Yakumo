import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

export function AccountRequired() {
  return (
    <section className='grid min-h-96 place-items-center border border-border bg-card p-8 text-center'>
      <div>
        <img
          src='/brand/yakumo-mark.png'
          alt=''
          className='mx-auto mb-6 size-20 rounded-2xl'
        />
        <p className='text-[10px] tracking-[0.25em] text-muted-foreground'>
          WELCOME TO YAKUMO
        </p>
        <h1 className='mt-3 text-2xl font-semibold'>你的跑步数据空间</h1>
        <p className='mt-3 text-sm text-muted-foreground'>
          登录或选择有效账号，查看属于你的运动进度。
        </p>
        <Button asChild className='mt-7'>
          <Link to='/accounts'>
            管理登录账号
            <ArrowRight className='size-4' />
          </Link>
        </Button>
      </div>
    </section>
  );
}
