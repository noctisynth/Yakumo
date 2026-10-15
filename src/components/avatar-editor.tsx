import { Camera, LoaderCircle } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { AccountAvatar } from '@/components/account-avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAccountsStore } from '@/stores/accounts-store';

export function AvatarEditor({
  accountId,
  avatarUrl,
  children,
}: {
  accountId: string;
  avatarUrl?: string | null;
  children: ReactNode;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const generation = useRef(0);
  const { pending, updateAvatar, error: accountError } = useAccountsStore();
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
    setNotice(null);
    useAccountsStore.getState().clearError();
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
  async function upload() {
    if (!preview || pending) return;
    const current = generation.current;
    const success = await updateAvatar(accountId, preview);
    if (current !== generation.current) {
      useAccountsStore.getState().clearError();
      return;
    }
    setError(
      success
        ? null
        : (useAccountsStore.getState().error?.message ??
            '头像操作未完成，请重试。'),
    );
    if (success) {
      setPreview(null);
      setNotice('头像已更新。');
    }
  }
  const message = error ?? accountError?.message;
  return (
    <section className='flex flex-wrap items-center gap-5 rounded-xl border border-border bg-card p-6'>
      <div className='relative shrink-0'>
        <button
          ref={trigger}
          type='button'
          aria-label='更换头像'
          title='更换头像'
          disabled={pending || reading}
          onClick={() => input.current?.click()}
          className='group relative block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-card disabled:cursor-wait'
        >
          <AccountAvatar
            avatarUrl={avatarUrl}
            className='size-20 rounded-2xl'
          />
          <span className='absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100'>
            {reading ? (
              <LoaderCircle className='size-5 animate-spin' />
            ) : (
              <Camera className='size-5' />
            )}
            <span className='text-[10px]'>
              {reading ? '正在处理' : '更换头像'}
            </span>
          </span>
          <span
            aria-hidden='true'
            className='absolute -right-1 -bottom-1 rounded-full border-[3px] border-card bg-primary p-1.5 text-primary-foreground transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0'
          >
            <Camera className='size-3' />
          </span>
        </button>
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
      </div>
      {children}
      {message && !preview && (
        <p
          role='alert'
          className='basis-full text-sm leading-6 text-destructive'
        >
          {message}
        </p>
      )}
      {notice && (
        <p role='status' className='basis-full text-xs text-muted-foreground'>
          {notice}
        </p>
      )}
      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open && !pending) {
            setPreview(null);
            setError(null);
            useAccountsStore.getState().clearError();
          }
        }}
      >
        <DialogContent
          showCloseButton={!pending}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            trigger.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>更换头像</DialogTitle>
            <DialogDescription>
              将使用图片居中的正方形区域，确认后同步到学校账号。
            </DialogDescription>
          </DialogHeader>
          <div className='flex justify-center rounded-xl bg-muted/40 py-6'>
            <AccountAvatar
              avatarUrl={preview}
              className='size-40 rounded-2xl'
            />
          </div>
          {message && (
            <p role='alert' className='text-sm leading-6 text-destructive'>
              {message}
            </p>
          )}
          <DialogFooter>
            <Button
              variant='outline'
              disabled={pending}
              onClick={() => {
                setPreview(null);
                setError(null);
                useAccountsStore.getState().clearError();
              }}
            >
              取消
            </Button>
            <Button disabled={pending} onClick={() => void upload()}>
              {pending ? '正在保存…' : '确认更换'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
