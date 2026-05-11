import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { markdownComponents, normalizePatternMessageForDisplay } from '@/components/chat-page/markdown';
import type { ChatMessage } from '@/lib/chat-types';
import { cn } from '@/lib/utils';

interface ChatMessageItemProps {
  message: ChatMessage;
}

export default function ChatMessageItem({ message }: ChatMessageItemProps) {
  return (
    <div
      className={cn(
        'animate-in fade-in slide-in-from-bottom-2',
        'flex max-w-[80%] flex-col',
        message.role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start',
      )}
    >
      <div className='mb-1 px-2 text-[10px] uppercase tracking-tighter text-slate-500 dark:text-gray-500'>
        {message.role}
      </div>
      <div
        className={cn(
          'rounded-2xl p-4 text-sm leading-relaxed',
          message.role === 'user'
            ? 'rounded-tr-none bg-blue-600 text-white'
            : 'rounded-tl-none border border-slate-200 bg-white/75 text-slate-800 shadow-sm shadow-slate-200/50 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:shadow-none',
        )}
      >
        <div className='prose prose-p:leading-relaxed prose-pre:p-0 max-w-none break-words'>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {normalizePatternMessageForDisplay(message.content)}
          </ReactMarkdown>
        </div>
      </div>
      <div className='mt-1 px-2 text-[10px] text-slate-400 dark:text-gray-600'>
        {format(new Date(message.createdAt), 'HH:mm')}
      </div>
    </div>
  );
}
