import { useRef } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUpdateStore } from '@/stores/update-store';

export function UpdatePrompt() {
  const navigate = useNavigate();
  const viewUpdate = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const viewingUpdate = useRef(false);
  const {
    candidate,
    phase,
    reminderVersion,
    reminderError,
    dismissReminder,
    skipVersion,
  } = useUpdateStore();
  if (
    !candidate ||
    phase !== 'available' ||
    reminderVersion !== candidate.version
  )
    return null;

  const version = candidate.version;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) dismissReminder(version);
      }}
    >
      <DialogContent
        className='gap-4 sm:gap-6'
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          previousFocus.current =
            document.activeElement instanceof HTMLElement &&
            document.activeElement !== document.body
              ? document.activeElement
              : null;
          viewingUpdate.current = false;
          viewUpdate.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = viewingUpdate.current
            ? document.getElementById('app-update')
            : previousFocus.current?.isConnected
              ? previousFocus.current
              : document.getElementById('main-content');
          target?.focus({ preventScroll: true });
        }}
      >
        <DialogHeader>
          <DialogTitle className='break-words'>
            发现新版本 {version}
          </DialogTitle>
          <DialogDescription>
            可以前往设置查看并安装更新，也可以稍后再处理。
          </DialogDescription>
        </DialogHeader>
        <p className='max-h-[min(14rem,25dvh)] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground'>
          {candidate.body || '此版本未提供更新说明。'}
        </p>
        <p className='text-xs leading-6 text-muted-foreground'>
          跳过后不再提醒此版本，有更新版本时仍会提醒。你随时可以在设置中手动更新。
        </p>
        {reminderError && (
          <p role='alert' className='text-sm text-destructive'>
            {reminderError}
          </p>
        )}
        <DialogFooter>
          <Button variant='ghost' onClick={() => skipVersion(version)}>
            跳过此版本
          </Button>
          <Button variant='outline' onClick={() => dismissReminder(version)}>
            稍后
          </Button>
          <Button
            ref={viewUpdate}
            onClick={() => {
              viewingUpdate.current = true;
              dismissReminder(version);
              navigate('/settings#app-update');
            }}
          >
            查看更新
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
