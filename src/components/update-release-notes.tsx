import type { ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

function ReleaseHeading({ children }: { children?: ReactNode }) {
  return (
    <h3 className='mt-4 mb-2 font-semibold text-foreground first:mt-0'>
      {children}
    </h3>
  );
}

const components: Components = {
  h1: ReleaseHeading,
  h2: ReleaseHeading,
  h3: ReleaseHeading,
  h4: ReleaseHeading,
  h5: ReleaseHeading,
  h6: ReleaseHeading,
  p: ({ children }) => <p className='mb-3 last:mb-0'>{children}</p>,
  ul: ({ children }) => (
    <ul className='my-3 list-disc space-y-1 pl-5 first:mt-0 last:mb-0'>
      {children}
    </ul>
  ),
  ol: ({ children, start }) => (
    <ol
      start={start}
      className='my-3 list-decimal space-y-1 pl-5 first:mt-0 last:mb-0'
    >
      {children}
    </ol>
  ),
  a: ({ href, children }) =>
    href ? (
      <a
        href={href}
        target='_blank'
        rel='noopener noreferrer'
        className='text-primary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring'
      >
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  img: ({ alt }) => <span>{alt || '图片'}</span>,
  code: ({ children }) => (
    <code className='rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground'>
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className='my-3 max-w-full overflow-x-auto rounded-lg bg-muted p-3 text-xs leading-5 text-foreground [&>code]:bg-transparent [&>code]:p-0'>
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className='my-3 border-l-2 border-primary/30 pl-3'>
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className='my-3 max-w-full overflow-x-auto'>
      <table className='w-full border-collapse'>{children}</table>
    </div>
  ),
  th: ({ children, style }) => (
    <th
      style={style}
      className='border border-border px-3 py-1 text-left font-medium text-foreground'
    >
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className='border border-border px-3 py-1'>
      {children}
    </td>
  ),
  hr: () => <hr className='my-4 border-border' />,
};

function releaseNoteUrl(url: string, key: string): string | undefined {
  if (key !== 'href') return;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password)
      return parsed.href;
  } catch {
    // Relative URLs must not navigate the app's hash router.
  }
}

export function UpdateReleaseNotes({
  body,
  className,
}: {
  body?: string | null;
  className?: string;
}) {
  return (
    <section
      aria-label='更新说明'
      // biome-ignore lint/a11y/noNoninteractiveTabindex: The scrollable notes need keyboard scrolling even without links.
      tabIndex={0}
      className={cn(
        'min-w-0 max-w-full break-words text-sm leading-6 text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring',
        className,
      )}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={releaseNoteUrl}
        components={components}
      >
        {body?.trim() || '此版本未提供更新说明。'}
      </Markdown>
    </section>
  );
}
