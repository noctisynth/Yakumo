import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AccountRequired } from '@/components/account-required';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDashboardAccount } from '@/hooks/use-dashboard-account';
import type { StudioPreset } from '@/models/studio';
import { editPresets, presetError } from '@/services/preset-service';
import { useStudioDraftStore } from '@/stores/studio-draft-store';

function Presets({ accountId }: { accountId: string }) {
  const [items, setItems] = useState<StudioPreset[]>([]),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(true),
    [editing, setEditing] = useState<string | null>(null),
    [name, setName] = useState(''),
    [deleting, setDeleting] = useState<string | null>(null);
  const mounted = useRef(true),
    locked = useRef(false);
  const navigate = useNavigate();
  const readSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++readSequence.current;
    setBusy(true);
    setError(null);
    try {
      const data = await editPresets(accountId, { kind: 'list' });
      if (mounted.current && sequence === readSequence.current) setItems(data);
    } catch (e) {
      if (mounted.current && sequence === readSequence.current)
        setError(presetError(e));
    } finally {
      if (mounted.current && sequence === readSequence.current) setBusy(false);
    }
  }, [accountId]);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      readSequence.current++;
    };
  }, [load]);
  async function change(p: StudioPreset, remove: boolean) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await editPresets(
        accountId,
        remove
          ? { kind: 'remove', id: p.id }
          : { kind: 'save', id: p.id, name, config: p.config },
      );
      if (mounted.current) {
        setItems(result);
        setEditing(null);
        setDeleting(null);
      }
    } catch (e) {
      if (mounted.current) setError(presetError(e));
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className='space-y-7'>
      <header className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-[10px] tracking-[0.25em] text-muted-foreground'>
            STUDIO / PRESETS
          </p>
          <h1 className='mt-3 text-3xl font-semibold'>
            把常用参数，留给下一次。
          </h1>
          <p className='mt-3 text-sm text-muted-foreground'>
            此账号的地图选点、基准参数与偏移范围，本机加密保存。
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button
            variant='ghost'
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              void load();
            }}
          >
            刷新列表
          </Button>
          <Button asChild variant='outline'>
            <Link to='/studio'>
              <Plus className='size-4' />
              创建预设
            </Link>
          </Button>
        </div>
      </header>
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}
      {!items.length && (
        <div className='rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground'>
          {busy
            ? '正在读取预设…'
            : error
              ? '预设尚未读取，请点击刷新列表重试。'
              : '还没有预设。在工作室设置选点和参数后，点击“保存为预设”。'}
        </div>
      )}
      <div className='grid gap-5 lg:grid-cols-2'>
        {items.map((p) => (
          <article
            key={p.id}
            className='space-y-5 rounded-xl border border-border bg-card p-5'
          >
            <div className='flex items-start justify-between gap-3'>
              <h2 className='break-all text-lg font-semibold'>{p.name}</h2>
              <span className='shrink-0 text-[10px] text-muted-foreground'>
                本机预设
              </span>
            </div>
            <p className='text-xs tabular-nums text-muted-foreground'>
              {p.config.route?.length
                ? `多点路线 · ${p.config.route.length} 个选点 · 起点`
                : '旧预设 · 需重新选线 · 中心'}{' '}
              {p.config.latitude?.toFixed(5)}, {p.config.longitude?.toFixed(5)}
            </p>
            <dl className='grid grid-cols-3 gap-3'>
              {[
                ['距离', `${p.config.distanceM} 米`],
                ['时长', `${p.config.durationS} 秒`],
                ['步数', `${p.config.steps} 步`],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className='text-xs text-muted-foreground'>{k}</dt>
                  <dd className='mt-2 text-sm'>{v}</dd>
                </div>
              ))}
            </dl>
            <div className='flex flex-wrap gap-2'>
              <Button
                disabled={busy}
                onClick={() => {
                  useStudioDraftStore
                    .getState()
                    .set(accountId, structuredClone(p.config));
                  navigate('/studio');
                }}
              >
                使用预设
              </Button>
              <Button
                variant='outline'
                disabled={busy}
                onClick={() => {
                  setEditing(p.id);
                  setName(p.name);
                }}
              >
                <Pencil className='size-3.5' />
                重命名
              </Button>
              <Button
                variant='ghost'
                disabled={busy}
                onClick={() => setDeleting(p.id)}
                aria-label={`删除预设 ${p.name}`}
              >
                <Trash2 className='size-3.5' />
                删除
              </Button>
            </div>
            {editing === p.id && (
              <form
                className='flex flex-wrap gap-2'
                onSubmit={(e) => {
                  e.preventDefault();
                  void change(p, false);
                }}
              >
                <Input
                  aria-label='预设名称'
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  required
                  disabled={busy}
                />
                <Button type='submit' disabled={busy || !name.trim()}>
                  保存名称
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  onClick={() => setEditing(null)}
                >
                  取消
                </Button>
              </form>
            )}
            {deleting === p.id && (
              <div className='space-y-3 rounded-lg bg-muted p-3 text-xs'>
                <p>确认删除此预设？已经生成或提交的记录不会受到影响。</p>
                <Button
                  variant='destructive'
                  disabled={busy}
                  onClick={() => void change(p, true)}
                >
                  确认删除
                </Button>
                <Button
                  variant='ghost'
                  disabled={busy}
                  onClick={() => setDeleting(null)}
                >
                  取消
                </Button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
export function StudioPresetsPage() {
  const { active, ready } = useDashboardAccount();
  return ready && active ? (
    <Presets key={active.id} accountId={active.id} />
  ) : (
    <AccountRequired />
  );
}
