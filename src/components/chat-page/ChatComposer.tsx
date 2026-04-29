import type { FormEvent, RefObject } from 'react';
import { Sparkles } from 'lucide-react';

interface ChatComposerProps {
  inputRef: RefObject<HTMLInputElement | null>;
  inputText: string;
  hasUploadedData: boolean;
  isResponding: boolean;
  activeDataSourceName: string;
  composerNotice: string;
  onInputChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function getComposerHelperText({
  composerNotice,
  hasUploadedData,
  activeDataSourceName,
}: Pick<
  ChatComposerProps,
  'composerNotice' | 'hasUploadedData' | 'activeDataSourceName'
>) {
  if (composerNotice) {
    return composerNotice;
  }

  if (!hasUploadedData) {
    return 'Upload ke bina query send nahi hogi. Pehle sidebar se sheet upload kijiye.';
  }

  if (activeDataSourceName) {
    return `Active Excel: ${activeDataSourceName}. Uploaded sheet ke basis par jawab diya jayega.`;
  }

  return 'Uploaded sheet ke basis par jawab diya jayega.';
}

export default function ChatComposer({
  inputRef,
  inputText,
  hasUploadedData,
  isResponding,
  activeDataSourceName,
  composerNotice,
  onInputChange,
  onSubmit,
}: ChatComposerProps) {
  return (
    <div className='bg-gradient-to-t from-slate-100 via-slate-100/90 to-transparent p-4 dark:from-black/80 dark:via-black/35 dark:to-transparent'>
      <form onSubmit={onSubmit} className='group relative mx-auto max-w-4xl'>
        <input
          ref={inputRef}
          type='text'
          value={inputText}
          onChange={(event) => onInputChange(event.target.value)}
          disabled={isResponding || !hasUploadedData}
          placeholder={
            hasUploadedData
              ? 'Sheet ke hisab se apna sawal poochiye...'
              : 'Upload Excel/CSV first to unlock chat...'
          }
          className='w-full rounded-2xl border border-slate-200 bg-white/85 py-4 pl-6 pr-14 text-slate-900 backdrop-blur-xl transition-all placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-gray-500'
        />
        <button
          type='submit'
          disabled={!inputText.trim() || isResponding || !hasUploadedData}
          className='absolute right-2 top-2 rounded-xl bg-blue-600 p-3 text-white transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40'
        >
          <Sparkles className='h-4 w-4' />
        </button>
      </form>

      <p className='mx-auto mt-3 max-w-4xl px-1 text-xs text-slate-500 dark:text-gray-500'>
        {getComposerHelperText({
          composerNotice,
          hasUploadedData,
          activeDataSourceName,
        })}
      </p>
      <p className='mx-auto mt-3 max-w-4xl px-1 text-center text-xs text-slate-500 dark:text-gray-500'>
        AI-generated content may not be accurate.
      </p>
    </div>
  );
}
