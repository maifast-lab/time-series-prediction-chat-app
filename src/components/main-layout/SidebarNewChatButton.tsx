import { Plus } from 'lucide-react';

interface SidebarNewChatButtonProps {
  isCreatingChat: boolean;
  onCreateChat: () => void;
}

export default function SidebarNewChatButton({
  isCreatingChat,
  onCreateChat,
}: SidebarNewChatButtonProps) {
  return (
    <button
      type='button'
      disabled={isCreatingChat}
      onClick={onCreateChat}
      className='group w-full rounded-xl border border-slate-200 bg-slate-900 px-4 py-3 text-left text-white transition-all hover:border-blue-500/50 hover:bg-slate-800 disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:hover:bg-white/10'
    >
      <div className='flex items-center gap-3'>
        <Plus className='h-5 w-5 text-slate-300 transition-colors group-hover:text-white dark:text-gray-400' />
        <span className='text-sm font-medium'>New Chat</span>
      </div>
    </button>
  );
}
