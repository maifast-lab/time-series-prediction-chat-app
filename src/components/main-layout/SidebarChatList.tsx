import { MessageSquare, PencilLine, Trash2 } from 'lucide-react';

import type { ChatSummary } from '@/lib/chat-types';
import { cn } from '@/lib/utils';

interface SidebarChatListProps {
  chats: ChatSummary[];
  activeChatId: string | null;
  onOpenChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onRenameChat: (chatId: string) => void;
}

export default function SidebarChatList({
  chats,
  activeChatId,
  onOpenChat,
  onDeleteChat,
  onRenameChat,
}: SidebarChatListProps) {
  return (
    <div className='no-scrollbar flex-1 space-y-2 overflow-y-auto px-2 py-2'>
      <div className='px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-gray-500'>
        Conversations
      </div>

      {chats.map((chat) => (
        <div
          key={chat._id}
          className={cn(
            'group relative mx-1 flex cursor-pointer items-center gap-3 overflow-hidden rounded-xl border px-3 py-3 text-sm transition-all',
            activeChatId === chat._id
              ? 'border-blue-500/20 bg-blue-600/10 text-slate-900 dark:text-white'
              : 'border-transparent text-slate-500 hover:bg-white/70 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200',
          )}
          onClick={() => onOpenChat(chat._id)}
        >
          <MessageSquare className='h-4 w-4 flex-shrink-0' />
          <div className='flex flex-1 flex-col truncate'>
            <span className='truncate font-medium'>
              {chat.company || 'New Chat'}
            </span>
          </div>
          <button
            type='button'
            aria-label={`Rename ${chat.company || 'chat'}`}
            onClick={(event) => {
              event.stopPropagation();
              onRenameChat(chat._id);
            }}
            className='rounded-md p-1.5 text-slate-500 opacity-0 transition-all hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100 dark:text-gray-500 dark:hover:bg-white/10 dark:hover:text-gray-200'
          >
            <PencilLine className='h-3.5 w-3.5' />
          </button>
          <button
            type='button'
            aria-label={`Delete ${chat.company || 'chat'}`}
            onClick={(event) => {
              event.stopPropagation();
              onDeleteChat(chat._id);
            }}
            className='rounded-md p-1.5 text-slate-500 opacity-0 transition-all hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100 dark:text-gray-500'
          >
            <Trash2 className='h-3.5 w-3.5' />
          </button>
        </div>
      ))}
    </div>
  );
}
