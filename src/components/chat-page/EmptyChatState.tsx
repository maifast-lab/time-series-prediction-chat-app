import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';

export default function EmptyChatState() {
  return (
    <motion.div
      key='empty-state'
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className='mx-auto mt-20 max-w-md rounded-3xl border border-blue-200 bg-white/75 p-8 text-center shadow-lg shadow-slate-200/60 dark:border-blue-500/10 dark:bg-blue-500/5 dark:shadow-none'
    >
      <div className='mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10'>
        <Lock className='h-8 w-8 text-blue-400' />
      </div>
      <h2 className='mb-2 text-lg font-bold text-slate-900 dark:text-white'>
        Upload required
      </h2>
      <p className='mb-6 text-sm text-slate-500 dark:text-gray-500'>
        Sidebar se Excel ya CSV upload kijiye. Upload hone ke baad yahi chat
        refresh ke baad bhi wahi file use karegi.
      </p>
    </motion.div>
  );
}
