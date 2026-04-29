import type { ChatPageData } from '@/lib/chat-types';

interface ChatHeaderProps {
  chat: ChatPageData['chat'];
}

export default function ChatHeader({ chat }: ChatHeaderProps) {
  return (
    <header className='z-10 flex items-center justify-between border-b border-slate-200 bg-white/65 px-6 py-4 backdrop-blur-md dark:border-white/5 dark:bg-black/20'>
      <div>
        <h1 className='text-xl font-bold text-slate-900 dark:text-white'>
          {chat.company}
        </h1>
        <div className='flex items-center gap-2 text-sm text-slate-500 dark:text-gray-500'>
          <span className='rounded bg-slate-200 px-2 py-0.5 text-xs dark:bg-white/5'>
            {chat.place}
          </span>
        </div>
      </div>
    </header>
  );
}
