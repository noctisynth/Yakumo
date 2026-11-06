import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UpdateReleaseNotes } from '../src/components/update-release-notes';
import { releaseNotes } from './updater-tools';

function render(body?: string | null) {
  return renderToStaticMarkup(createElement(UpdateReleaseNotes, { body }));
}

describe('update release notes', () => {
  test('renders real release headings, lists, commit links and continuation paragraphs', () => {
    const changelog = readFileSync(
      new URL('../src-tauri/CHANGELOG.md', import.meta.url),
      'utf8',
    );
    const current = render(releaseNotes(changelog, '0.2.2'));
    expect(current).toMatch(/<h3[^>]*>Bug Fixes<\/h3>/);
    expect(current).toMatch(/<ul[^>]*>\s*<li>/);
    expect(current).toMatch(
      /<a[^>]*href="https:\/\/github.com\/noctisynth\/Yakumo\/commit\/23fd3bf1b238d12729d1ef4881e4c6454d049e45"[^>]*><code[^>]*>23fd3bf<\/code><\/a>/,
    );
    expect(current).toContain('自动刷新账号令牌');
    expect(current).not.toContain('semifold:release');
    expect(current).not.toContain('### Bug Fixes');

    const initial = render(releaseNotes(changelog, '0.1.0'));
    const continuation = initial
      .match(/<li>[\s\S]*?<\/li>/g)
      ?.find((item) => item.includes('0686e87'));
    expect(continuation).toBeDefined();
    expect(continuation?.match(/<p\b/g)).toHaveLength(2);
    expect(continuation).toContain(
      'Add a shared-version Semifold workspace, release metadata checks, desktop GitHub CI/CD, and alpha application release automation.',
    );
  });

  test('renders common Markdown and GitHub-flavored structures', () => {
    const html = render(
      [
        '## Release details',
        '',
        '**Bold** and *emphasis* and ~~removed~~ with `inline code`.',
        '',
        '- Unordered item',
        '  - Nested item',
        '',
        '3. Third item',
        '4. Fourth item',
        '',
        '- [x] Complete',
        '- [ ] Pending',
        '',
        '> A quoted note',
        '',
        '```ts',
        'const value = "<script>literal</script>";',
        '```',
        '',
        '| Platform | Result |',
        '| :--- | ---: |',
        '| Desktop | Ready |',
      ].join('\n'),
    );
    expect(html).toMatch(/<h3[^>]*>Release details<\/h3>/);
    expect(html).toContain('<strong>Bold</strong>');
    expect(html).toContain('<em>emphasis</em>');
    expect(html).toContain('<del>removed</del>');
    expect(html).toMatch(/<code[^>]*>inline code<\/code>/);
    expect(html).toMatch(/<li>Unordered item\s*<ul[^>]*>\s*<li>Nested item/);
    expect(html).toMatch(/<ol[^>]*start="3"/);
    expect(html).toMatch(
      /<input[^>]*type="checkbox"[^>]*disabled=""[^>]*checked=""/,
    );
    expect(html.match(/<input\b/g)).toHaveLength(2);
    expect(html).toMatch(/<blockquote[^>]*>\s*<p[^>]*>A quoted note/);
    expect(html).toMatch(/<pre[^>]*><code[^>]*>/);
    expect(html).toContain('&lt;script&gt;literal&lt;/script&gt;');
    expect(html).toMatch(/<table[^>]*>/);
    expect(html).toMatch(/<th[^>]*>Platform<\/th>/);
    expect(html).toMatch(/<td[^>]*>Ready<\/td>/);
  });

  test('uses a readable fallback for absent notes and preserves ordinary text', () => {
    for (const body of [undefined, null, '', '  \n\t']) {
      expect(render(body)).toContain('此版本未提供更新说明。');
    }
    const html = render('修复更新提醒。\n\n保留手动安装。');
    expect(html).toMatch(/<p[^>]*>修复更新提醒。<\/p>/);
    expect(html).toMatch(/<p[^>]*>保留手动安装。<\/p>/);
    expect(html).toContain('aria-label="更新说明"');
    expect(html).toContain('tabindex="0"');
  });

  test('raw HTML and script content cannot create executable elements', () => {
    const html = render(
      [
        '**Visible** <b>inline text</b>',
        '',
        '<script>globalThis.syntheticExecution = true</script>',
        '',
        '<iframe src="https://example.invalid/frame"></iframe>',
        '',
        '<img src="https://example.invalid/pixel" onerror="alert(1)">',
        '',
        '<a href="javascript:alert(1)" onclick="alert(2)">raw link</a>',
      ].join('\n'),
    );
    expect(html).toContain('<strong>Visible</strong>');
    expect(html).toContain('inline text');
    expect(html).not.toMatch(/<(?:script|iframe|img|b|a)\b/i);
    expect(html).not.toMatch(/\bon(?:error|click)=/i);
  });

  test('unsupported and relative link destinations remain readable without navigation', () => {
    const destinations = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'javascript&#58;alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'http://example.invalid/release',
      '/settings',
      '../release',
      '#app-update',
      '//example.invalid/release',
      'mailto:synthetic@example.invalid',
      'https://user:password@example.invalid/release',
    ];
    for (const destination of destinations) {
      const html = render(`[Readable label](<${destination}>)`);
      expect(html).toContain('Readable label');
      expect(html).not.toMatch(/<a\b/);
      expect(html).not.toContain('href=');
    }
  });

  test('HTTPS links open separately with safe external-link attributes', () => {
    const html = render(
      '[Release](https://example.invalid/releases?v=2&platform=desktop)\n\nhttps://example.invalid/help',
    );
    const links = html.match(/<a\b[^>]*>/g) ?? [];
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toContain('target="_blank"');
      expect(link).toContain('rel="noopener noreferrer"');
      expect(link).toContain('href="https://example.invalid/');
    }
    expect(html).toContain('v=2&amp;platform=desktop');
  });

  test('Markdown images show alt text without image or preload elements', () => {
    const html = render(
      '![Release illustration](https://example.invalid/image.png)\n\n![](https://example.invalid/pixel.gif)',
    );
    expect(html).toContain('Release illustration');
    expect(html).toContain('图片');
    expect(html).not.toMatch(/<(?:img|link)\b/);
    expect(html).not.toContain('src=');
    expect(html).not.toContain('example.invalid');
  });
});
