import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/lib/utils';

type MarkdownCodeProps = ComponentPropsWithoutRef<'code'> & {
  inline?: boolean;
  children?: ReactNode;
};

export function normalizePatternMessageForDisplay(content: string) {
  const trimmed = content.trim().replace(/\r\n?/g, '\n');
  const headerMatch = trimmed.match(/^Ye pattern \d+ jgh mila hai\s*:/i);

  if (!headerMatch) {
    return content;
  }

  const header = headerMatch[0].replace(/\s*:\s*$/, ' :');
  const remainder = trimmed.slice(headerMatch[0].length).trim();

  if (!remainder) {
    return header;
  }

  const entryMatches = remainder.match(
    /(?:\d{1,2}(?:st|nd|rd|th)\s+[A-Za-z]+(?:\s+\d{4})?|Row\s+\d+)\s*-\s*-?\d+(?:\.\d+)?/g,
  );

  if (!entryMatches || entryMatches.length === 0) {
    return `${header}  \n${remainder}`;
  }

  return `${header}  \n${entryMatches.join('  \n')}`;
}

export const markdownComponents = {
  p: ({ children }: { children?: ReactNode }) => (
    <p className='mb-2 last:mb-0 whitespace-pre-wrap'>{children}</p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className='mb-2 ml-4 list-disc'>{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className='mb-2 ml-4 list-decimal'>{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className='mb-1'>{children}</li>
  ),
  code: ({
    inline,
    className,
    children,
    ...props
  }: MarkdownCodeProps) =>
    !inline ? (
      <div className='my-2 overflow-x-auto rounded-lg border border-slate-900/80 bg-slate-950 p-3'>
        <code
          className={cn('font-mono text-sm text-slate-100', className)}
          {...props}
        >
          {children}
        </code>
      </div>
    ) : (
      <code
        className='rounded bg-slate-950 px-1.5 py-0.5 font-mono text-sm text-slate-100'
        {...props}
      >
        {children}
      </code>
    ),
};
