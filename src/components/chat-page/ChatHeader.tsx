import { Check, PencilLine, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

import type { ChatPageData } from '@/lib/chat-types';

interface ChatHeaderProps {
  chat: ChatPageData['chat'];
  isRenaming?: boolean;
  dateRangeLabel?: string;
  onRename: (name: string) => Promise<void> | void;
}

export default function ChatHeader({
  chat,
  isRenaming = false,
  dateRangeLabel = '',
  onRename,
}: ChatHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(chat.company);
  const [renameError, setRenameError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(
        inputRef.current.value.length,
        inputRef.current.value.length,
      );
    }
  }, [isEditing]);

  function startRename() {
    setDraftName(chat.company);
    setRenameError('');
    setIsEditing(true);
  }

  function cancelRename() {
    setIsEditing(false);
    setDraftName(chat.company);
    setRenameError('');
  }

  async function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = draftName.trim();

    if (!nextName) {
      setRenameError('Chat name cannot be empty.');
      return;
    }

    if (nextName === chat.company) {
      setIsEditing(false);
      setRenameError('');
      return;
    }

    try {
      await onRename(nextName);
      setIsEditing(false);
      setRenameError('');
    } catch {
      setRenameError('Unable to rename chat right now.');
    }
  }

  function handleRenameInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelRename();
    }
  }

  return (
    <header className='z-10 flex items-center justify-between border-b border-slate-200 bg-white/65 px-6 py-4 backdrop-blur-md dark:border-white/5 dark:bg-black/20'>
      <div>
        {isEditing ? (
          <form onSubmit={submitRename} className='flex items-center gap-2'>
            <input
              ref={inputRef}
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={handleRenameInputKeyDown}
              className='w-full max-w-xl rounded-md border border-slate-300 bg-white px-3 py-2 text-xl font-bold text-slate-900 focus:border-blue-500 focus:outline-none dark:border-white/15 dark:bg-white/5 dark:text-white'
              disabled={isRenaming}
            />
            <button
              type='submit'
              className='rounded-md bg-blue-600 px-2 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300'
              disabled={isRenaming}
              aria-label='Save chat name'
            >
              <Check className='size-4' />
            </button>
            <button
              type='button'
              onClick={cancelRename}
              className='rounded-md border border-slate-300 px-2 py-2 text-slate-600 transition-colors hover:bg-slate-100 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/10'
              disabled={isRenaming}
              aria-label='Cancel rename'
            >
              <X className='size-4' />
            </button>
          </form>
        ) : (
          <div className='flex items-center gap-3'>
            <h1 className='text-xl font-bold text-slate-900 dark:text-white'>
              {chat.company}
            </h1>
            <button
              type='button'
              onClick={startRename}
              className='rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/10'
              aria-label='Rename chat'
            >
              <PencilLine className='size-4' />
            </button>
          </div>
        )}
        {renameError ? <p className='mt-1 text-sm text-red-500'>{renameError}</p> : null}
        <div className='flex items-center gap-2 text-sm text-slate-500 dark:text-gray-500'>
          <span className='rounded bg-slate-200 px-2 py-0.5 text-xs dark:bg-white/5'>
            {chat.place}
          </span>
          {dateRangeLabel ? (
            <span className='text-xs font-medium text-slate-400 dark:text-gray-600'>
              {dateRangeLabel}
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}
