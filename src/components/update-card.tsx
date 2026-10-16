import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUpdateStore } from '@/stores/update-store';

const labels = {
  idle: '每次打开应用时自动检查，也可以手动检查。',
  checking: '正在检查更新，连接失败时会尝试备用地址…',
  current: '当前已是最新版本。镜像同步可能稍有延迟。',
  available: '发现新版本，可以下载更新。',
  downloading: '正在下载并验证安装包…',
  ready: '安装包已通过签名校验，可以安装。',
  installing: '正在安装，请留意系统确认窗口…',
  installed: '安装流程已完成，请重新打开应用确认运行版本。',
  error: '更新未完成。',
  cancelled: '下载已取消，重新检查后可以重试。',
};

export function UpdateCard() {
  const state = useUpdateStore();
  const [confirm, setConfirm] = useState(false);
  const enabled = state.status?.supported && state.status.configured;
  const busy = ['checking', 'downloading', 'installing', 'installed'].includes(
    state.phase,
  );
  const android = state.status?.platform === 'android';
  return (
    <Card className='rounded-2xl border-border/70 shadow-none'>
      <CardHeader>
        <CardTitle>应用更新</CardTitle>
        <CardDescription>
          当前版本 {state.status?.version ?? '读取中'}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <p role='status' className='text-sm text-muted-foreground'>
          {!state.status
            ? '正在读取更新配置…'
            : !state.status.supported
              ? '此环境不支持应用内更新。'
              : !state.status.configured
                ? '此客户端尚未配置更新签名，请从官方发布页安装新版。'
                : labels[state.phase]}
        </p>
        {state.candidate && (
          <div className='space-y-2'>
            <p className='font-medium'>新版本 {state.candidate.version}</p>
            <p className='max-h-64 overflow-auto whitespace-pre-wrap text-sm leading-6 text-muted-foreground'>
              {state.candidate.body || '此版本未提供更新说明。'}
            </p>
          </div>
        )}
        {state.phase === 'downloading' && (
          <div className='space-y-2'>
            <div
              role='progressbar'
              aria-label='下载更新'
              className='h-1 animate-pulse rounded bg-primary/50'
            />
            <p className='text-xs text-muted-foreground'>
              累计传输 {(state.transferred / 1_048_576).toFixed(1)}{' '}
              MiB（包含重试流量）
            </p>
          </div>
        )}
        {state.error && (
          <p role='alert' className='text-sm text-destructive'>
            {state.error}
          </p>
        )}
        <div className='flex flex-wrap gap-3'>
          <Button
            variant='outline'
            disabled={!enabled || busy}
            onClick={() => void state.check()}
          >
            检查更新
          </Button>
          {state.phase === 'available' && (
            <Button onClick={() => void state.download()}>下载更新</Button>
          )}
          {state.phase === 'downloading' && (
            <Button variant='outline' onClick={() => void state.cancel()}>
              取消下载
            </Button>
          )}
          {state.phase === 'ready' && (
            <Button onClick={() => setConfirm(true)}>安装更新</Button>
          )}
          {state.phase === 'installed' && !android && (
            <Button onClick={() => void state.restart()}>重启应用</Button>
          )}
          <Button asChild variant='link'>
            <a
              href='https://github.com/noctisynth/Yakumo/releases'
              target='_blank'
              rel='noreferrer'
            >
              官方发布页
            </a>
          </Button>
        </div>
        <p className='text-xs leading-6 text-muted-foreground'>
          通过公开镜像与官方地址获取更新。镜像可用性随网络变化；所有安装包必须通过同一签名与版本校验。
        </p>
        <Dialog open={confirm} onOpenChange={setConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>安装 {state.candidate?.version}</DialogTitle>
              <DialogDescription>
                {android
                  ? '系统可能要求允许此来源安装应用，并再次确认安装。完成后应用可能关闭，请重新打开确认版本。'
                  : '安装期间应用可能关闭。请先完成当前操作，安装后重新打开应用。'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant='outline' onClick={() => setConfirm(false)}>
                暂不安装
              </Button>
              <Button
                onClick={() => {
                  setConfirm(false);
                  void state.install();
                }}
              >
                确认安装
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
