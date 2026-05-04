'use client';

import {
  useEffect,
  useRef,
  useState,
  type ChangeEventHandler,
} from 'react';
import {
  Download,
  Ellipsis,
  FileSpreadsheet,
  Lightbulb,
  Sparkles,
  Upload,
} from 'lucide-react';
import { motion } from 'framer-motion';

import type { UploadStep } from '@/components/main-layout/types';
import { cn } from '@/lib/utils';

interface SidebarFileActionsProps {
  onUploadFile: ChangeEventHandler<HTMLInputElement>;
  onDownloadSample: () => void;
  onOpenSheetEditor: () => void;
  onOpenSuggestionPage: () => void;
  isSuggestionPage: boolean;
  uploadStep: UploadStep;
  progressMessage: string;
}

export default function SidebarFileActions({
  onUploadFile,
  onDownloadSample,
  onOpenSheetEditor,
  onOpenSuggestionPage,
  isSuggestionPage,
  uploadStep,
  progressMessage,
}: SidebarFileActionsProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        fileMenuRef.current &&
        !fileMenuRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  return (
    <div className='border-t border-white/5 p-4'>
      <div className='flex items-center justify-between px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-gray-500'>
        Workspace Tools
      </div>

      <div className='space-y-3 px-2 py-2'>
        <div className='relative' ref={fileMenuRef}>
          <input
            ref={fileInputRef}
            type='file'
            accept='.xlsx,.xls,.csv'
            className='hidden'
            onChange={(event) => {
              console.log('File input changed:', {
                filesSelected: event.target.files?.length ?? 0,
                firstFileName: event.target.files?.[0]?.name ?? null,
              });
              onUploadFile(event);
            }}
          />

          <button
            type='button'
            aria-label='Open file actions'
            onClick={() => setIsMenuOpen((open) => !open)}
            className='w-full rounded-lg border border-slate-200 bg-white/85 px-3 py-2.5 text-[11px] font-medium text-slate-600 transition-all hover:border-blue-500/40 hover:bg-white hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
          >
            <span className='flex items-center justify-between gap-3'>
              <span className='flex items-center gap-2'>
                <FileSpreadsheet className='h-3.5 w-3.5' />
                <span>Sheet Actions</span>
              </span>
              <Ellipsis className='h-3.5 w-3.5' />
            </span>
          </button>

          {isMenuOpen && (
            <div className='absolute left-0 right-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-xl shadow-slate-200/70 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95 dark:shadow-black/30'>
              <button
                type='button'
                onClick={() => {
                  fileInputRef.current?.click();
                  setIsMenuOpen(false);
                }}
                className='w-full px-3 py-3 text-left text-xs text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5'
              >
                <span className='flex items-center gap-2'>
                  <Upload className='h-3.5 w-3.5' />
                  <span>Upload New File</span>
                </span>
              </button>

              <a
                href='/dummy.csv'
                download='dummy.csv'
                onClick={() => {
                  setIsMenuOpen(false);
                  onDownloadSample();
                }}
                className='flex items-center gap-2 px-3 py-3 text-xs text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5'
              >
                <Download className='h-3.5 w-3.5' />
                <span>Download Dummy CSV</span>
              </a>

              <button
                type='button'
                onClick={() => {
                  setIsMenuOpen(false);
                  onOpenSheetEditor();
                }}
                className='w-full px-3 py-3 text-left text-xs text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5'
              >
                <span className='flex items-center gap-2'>
                  <FileSpreadsheet className='h-3.5 w-3.5' />
                  <span>Edit Current File</span>
                </span>
              </button>
            </div>
          )}
        </div>

        <button
          type='button'
          onClick={onOpenSuggestionPage}
          className={cn(
            'w-full rounded-xl border px-3 py-3 text-left transition-all',
            isSuggestionPage
              ? 'border-amber-500/30 bg-amber-500/10 text-slate-950 shadow-sm shadow-amber-500/10 dark:text-white'
              : 'border-slate-200 bg-white/85 text-slate-700 hover:border-amber-500/30 hover:bg-white hover:text-slate-950 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white',
          )}
        >
          <span className='flex items-start gap-3'>
            <span className='mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-200'>
              <Lightbulb className='h-4 w-4' />
            </span>
            <span className='flex min-w-0 flex-col'>
              <span className='text-sm font-semibold'>Share Suggestion</span>
              <span className='mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400'>
                Open the feedback page and post a title with description.
              </span>
            </span>
          </span>
        </button>

        {uploadStep !== 'idle' ? (
          <div
            className={cn(
              'flex flex-col gap-2 rounded-xl border bg-white/75 p-3 dark:bg-black/20',
              uploadStep === 'error'
                ? 'border-red-500/20'
                : 'border-blue-500/20',
            )}
          >
            <div className='flex items-center gap-2'>
              {uploadStep !== 'success' && uploadStep !== 'error' && (
                <UploadStatusIcon />
              )}
              <span className='text-[10px] font-medium uppercase tracking-tighter text-slate-700 dark:text-gray-200'>
                {progressMessage}
              </span>
            </div>

            <div className='h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/5'>
              <motion.div
                initial={{ width: 0 }}
                animate={{
                  width:
                    uploadStep === 'analyzing'
                      ? '40%'
                      : uploadStep === 'processing'
                        ? '90%'
                        : '100%',
                }}
                className={cn(
                  'h-full transition-all duration-500',
                  uploadStep === 'error' ? 'bg-red-500' : 'bg-blue-500',
                )}
              />
            </div>
          </div>
        ) : (
          <p className='px-3 text-[10px] leading-relaxed text-slate-500 dark:text-gray-500'>
            Open sheet actions, share a product suggestion, or move to the
            sheet editor.
          </p>
        )}
      </div>
    </div>
  );
}

function UploadStatusIcon() {
  return <Sparkles className='h-3.5 w-3.5 animate-pulse text-blue-400' />;
}
