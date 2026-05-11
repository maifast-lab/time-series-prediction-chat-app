import { Lock, Sparkles } from 'lucide-react';

interface EmptyChatStateProps {
  hasUploadedData: boolean;
}

export default function EmptyChatState({ hasUploadedData }: EmptyChatStateProps) {
  const heading = hasUploadedData ? 'Sheet chat ready' : 'Start chatting';
  const details = hasUploadedData
    ? 'Your uploaded sheet is active. Ask a question to get data-based insights.'
    : 'No sheet is uploaded yet. You can ask anything for general AI help, then upload a file anytime for data-specific answers.';
  const Icon = hasUploadedData ? Lock : Sparkles;

  return (
    <div
      key='empty-state'
      className='mx-auto mt-20 max-w-md rounded-3xl border border-blue-200 bg-white/75 p-8 text-center shadow-lg shadow-slate-200/60 dark:border-blue-500/10 dark:bg-blue-500/5 dark:shadow-none animate-in fade-in'
    >
      <div className='mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10'>
        <Icon className='h-8 w-8 text-blue-400' />
      </div>
      <h2 className='mb-2 text-lg font-bold text-slate-900 dark:text-white'>
        {heading}
      </h2>
      <p className='mb-6 text-sm leading-6 text-slate-500 dark:text-gray-500'>
        {details}
      </p>
    </div>
  );
}
