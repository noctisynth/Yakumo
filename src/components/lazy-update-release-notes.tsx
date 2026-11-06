import { type ComponentProps, lazy, Suspense } from 'react';

const ReleaseNotes = lazy(() =>
  import('@/components/update-release-notes').then((module) => ({
    default: module.UpdateReleaseNotes,
  })),
);

export function LazyUpdateReleaseNotes(
  props: ComponentProps<typeof ReleaseNotes>,
) {
  return (
    <Suspense
      fallback={
        <p role='status' className='text-sm leading-6 text-muted-foreground'>
          正在加载更新说明…
        </p>
      }
    >
      <ReleaseNotes {...props} />
    </Suspense>
  );
}
