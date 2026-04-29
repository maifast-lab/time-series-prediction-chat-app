import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

export default function ChatThinkingIndicator() {
  return (
    <motion.div
      key='thinking'
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className='mr-auto flex max-w-[80%] flex-col items-start'
    >
      <div className='mb-1 px-2 text-[10px] uppercase tracking-tighter text-slate-500 dark:text-gray-500'>
        Maifast
      </div>
      <div className='flex items-center gap-3 rounded-2xl rounded-tl-none border border-slate-200 bg-white/75 p-4 text-sm leading-relaxed text-slate-700 shadow-sm shadow-slate-200/50 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:shadow-none'>
        <Loader2 className='h-4 w-4 animate-spin text-blue-400' />
        <span className='animate-pulse'>Thinking...</span>
      </div>
    </motion.div>
  );
}
