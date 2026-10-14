import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className='flex min-h-80 flex-col items-start justify-center gap-5'>
      <p className='font-mono text-sm text-primary'>404</p>
      <h1 className='text-3xl font-semibold'>这条路还没有铺好</h1>
      <p className='text-sm text-muted-foreground'>
        回到工作台，继续你的节奏。
      </p>
      <Button asChild className='rounded-xl'>
        <Link to='/'>
          <ArrowLeft className='size-4' aria-hidden='true' />
          返回概览
        </Link>
      </Button>
    </div>
  );
}
