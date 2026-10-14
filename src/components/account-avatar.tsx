import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export function AccountAvatar({
  avatarUrl,
  className,
}: {
  avatarUrl?: string | null;
  className?: string;
}) {
  return (
    <Avatar aria-hidden='true' className={cn('size-10 rounded-xl', className)}>
      {avatarUrl && (
        <AvatarImage src={avatarUrl} alt='' referrerPolicy='no-referrer' />
      )}
      <AvatarFallback>
        <img
          src='/brand/yakumo-mark.png'
          alt=''
          className='size-full object-cover'
        />
      </AvatarFallback>
    </Avatar>
  );
}
