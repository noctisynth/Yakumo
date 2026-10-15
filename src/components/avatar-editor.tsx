import { Camera, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AccountAvatar } from '@/components/account-avatar';
import { Button } from '@/components/ui/button';
import { useAccountsStore } from '@/stores/accounts-store';

export function AvatarEditor({ accountId }: { accountId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const generation = useRef(0);
  const {
    pending,
    refreshIdentity,
    updateAvatar,
    error: accountError,
  } = useAccountsStore();
  useEffect(() => {
    void accountId;
    generation.current++;
    setPreview(null);
    setReading(false);
    setError(null);
    return () => {
      generation.current++;
      useAccountsStore.getState().clearError();
    };
  }, [accountId]);
  async function choose(file?: File) {
    if (!file) return;
    const current = ++generation.current;
    setError(null);
    setReading(true);
    try {
      if (
        !['image/png', 'image/jpeg'].includes(file.type) ||
        file.size > 8 * 1024 * 1024
      )
        throw new Error('请选择 8 MiB 以内的 PNG 或 JPEG 图片。');
      const bitmap = await createImageBitmap(file);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 504;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('无法处理这张图片，请换一张重试。');
        const side = Math.min(bitmap.width, bitmap.height);
        context.drawImage(
          bitmap,
          (bitmap.width - side) / 2,
          (bitmap.height - side) / 2,
          side,
          side,
          0,
          0,
          504,
          504,
        );
        if (current === generation.current)
          setPreview(canvas.toDataURL('image/png'));
      } finally {
        bitmap.close();
      }
    } catch (e) {
      if (current === generation.current)
        setError(e instanceof Error ? e.message : '图片无法读取，请重新选择。');
    } finally {
      if (current === generation.current) setReading(false);
    }
  }
  async function act(upload: boolean) {
    const success =
      upload && preview
        ? await updateAvatar(accountId, preview)
        : await refreshIdentity(accountId);
    setError(
      success
        ? null
        : (useAccountsStore.getState().error?.message ??
            '头像操作未完成，请重试。'),
    );
    if (success && upload) setPreview(null);
  }
  return (
    <div className='basis-full space-y-3 border-t border-border pt-4'>
      <input
        ref={input}
        type='file'
        accept='image/png,image/jpeg'
        aria-label='选择头像图片'
        className='hidden'
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <div className='flex flex-wrap gap-2'>
        <Button
          size='sm'
          variant='outline'
          disabled={pending || reading}
          onClick={() => input.current?.click()}
        >
          <Camera className='size-4' />
          {reading ? '正在处理…' : '更换头像'}
        </Button>
        <Button
          size='sm'
          variant='ghost'
          disabled={pending || reading}
          onClick={() => void act(false)}
        >
          <RefreshCw className='size-4' />
          刷新头像
        </Button>
      </div>
      {preview && (
        <div className='flex flex-wrap items-center gap-4 rounded-xl bg-background/50 p-4'>
          <AccountAvatar avatarUrl={preview} className='size-16' />
          <div className='flex-1 text-xs leading-6 text-muted-foreground'>
            将使用居中的正方形区域。确认后同步到学校账号。
          </div>
          <Button size='sm' disabled={pending} onClick={() => void act(true)}>
            {pending ? '正在保存…' : '确认更换'}
          </Button>
          <Button
            size='sm'
            variant='ghost'
            disabled={pending}
            onClick={() => setPreview(null)}
          >
            取消
          </Button>
        </div>
      )}
      {(error || accountError) && (
        <p role='alert' className='text-sm text-destructive'>
          {error ?? accountError?.message}
        </p>
      )}
    </div>
  );
}
