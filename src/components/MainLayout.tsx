'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Plus,
  MessageSquare,
  ChevronRight,
  Upload,
  Sparkles,
  Trash2,
  LogOut,
  LogIn,
  Download,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession, signIn, signOut } from 'next-auth/react';
import Image from 'next/image';

import { createChatAction, deleteChatAction } from '@/app/actions/chat';
import { uploadDataSourceAction } from '@/app/actions/data-source';
import logoImg from '@/app/logo.jpg';
import type { ChatSummary } from '@/lib/chat-types';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

interface MainLayoutProps {
  children: React.ReactNode;
  initialChats: ChatSummary[];
}

export default function MainLayout({
  children,
  initialChats,
}: MainLayoutProps) {
  const [chats, setChats] = useState(initialChats);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [uploadStep, setUploadStep] = useState<
    'idle' | 'analyzing' | 'processing' | 'success' | 'error'
  >('idle');
  const [progressMsg, setProgressMsg] = useState('');
  const [isCreatingChat, startCreateTransition] = useTransition();

  const { data: session } = useSession();
  const router = useRouter();
  const params = useParams();
  const activeChatId =
    typeof params?.id === 'string'
      ? params.id
      : Array.isArray(params?.id)
        ? params.id[0]
        : null;

  useEffect(() => {
    setChats(initialChats);
  }, [initialChats]);

  async function handleDelete(event: React.MouseEvent, chatId: string) {
    event.stopPropagation();

    if (!confirm('Are you sure you want to delete this chat?')) {
      return;
    }

    const result = await deleteChatAction(chatId);
    if (!result.ok) {
      logger.error('Delete failed', result.error);
      return;
    }

    setChats((prev) => prev.filter((chat) => chat._id !== chatId));

    if (activeChatId === chatId) {
      router.push('/');
      return;
    }

    router.refresh();
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!session?.user?.dbId) {
      router.push('/login');
      event.target.value = '';
      return;
    }

    setUploadStep('analyzing');
    setProgressMsg('AI is analyzing format...');

    const formData = new FormData();
    formData.append('file', file);
    if (activeChatId) {
      formData.append('chatId', activeChatId);
    }

    try {
      const result = await uploadDataSourceAction(formData);
      if (!result.ok) {
        setUploadStep('error');
        setProgressMsg(result.error);
        setTimeout(() => setUploadStep('idle'), 5000);
        return;
      }

      setUploadStep('processing');
      setProgressMsg('Bulk mapping 100% complete...');
      setTimeout(() => {
        setUploadStep('success');
        setProgressMsg(
          activeChatId
            ? `${file.name} is now linked to this chat.`
            : `${file.name} is ready for AI chat.`,
        );
        setTimeout(() => setUploadStep('idle'), 3000);
        router.refresh();
        window.dispatchEvent(new Event('datasource-uploaded'));
      }, 800);
    } catch (error) {
      logger.error('Upload failed', error);
      setUploadStep('error');
      setProgressMsg('Network error.');
      setTimeout(() => setUploadStep('idle'), 3000);
    } finally {
      event.target.value = '';
    }
  }

  return (
    <div className='flex h-screen w-full bg-transparent text-slate-900 dark:text-gray-100 overflow-hidden font-sans selection:bg-blue-500/30'>
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className='md:hidden fixed top-4 left-4 z-[60] p-2 rounded-lg bg-white/85 dark:bg-white/10 backdrop-blur-md border border-slate-200 dark:border-white/10 text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
      >
        {isSidebarOpen ? (
          <Plus className='w-5 h-5 rotate-45' />
        ) : (
          <ChevronRight className='w-5 h-5' />
        )}
      </button>

      <AnimatePresence mode='wait'>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className='fixed inset-0 bg-slate-900/25 dark:bg-black/60 backdrop-blur-sm z-[45] md:hidden'
            />
            <motion.div
              initial={{ x: -260, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -260, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className='fixed md:relative w-[280px] md:w-[260px] flex-shrink-0 bg-white/88 dark:bg-[#000510]/80 backdrop-blur-xl border-r border-slate-200 dark:border-white/10 flex flex-col h-full z-50 shadow-xl shadow-slate-200/60 dark:shadow-none'
            >
              <div className='p-4 pt-16 md:pt-4 flex flex-col gap-6'>
                <div className='flex items-center gap-3 px-2'>
                  <div className='w-8 h-8 rounded-lg overflow-hidden border border-slate-200 dark:border-white/10 shadow-lg shadow-blue-500/20'>
                    <Image
                      src={logoImg}
                      alt='Maifast Logo'
                      className='w-full h-full object-cover'
                    />
                  </div>
                  <span className='font-bold text-xl bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400'>
                    Maifast
                  </span>
                </div>

                <button
                  type='button'
                  disabled={isCreatingChat}
                  onClick={() => {
                    startCreateTransition(async () => {
                      if (!session?.user?.dbId) {
                        router.push('/login');
                        return;
                      }

                      const result = await createChatAction();
                      if (!result.ok) {
                        logger.error('New chat creation failed', result.error);
                        return;
                      }

                      router.push(`/c/${result.data._id}`);
                      if (window.innerWidth < 768) {
                        setIsSidebarOpen(false);
                      }
                    });
                  }}
                  className='w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-900 text-white dark:bg-white/5 dark:text-gray-100 hover:border-blue-500/50 dark:hover:bg-white/10 hover:bg-slate-800 transition-all group text-left disabled:opacity-60'
                >
                  <Plus className='w-5 h-5 text-slate-300 dark:text-gray-400 group-hover:text-white transition-colors' />
                  <span className='text-sm font-medium'>New Chat</span>
                </button>
              </div>

              <div className='flex-1 overflow-y-auto no-scrollbar px-2 space-y-2 py-2'>
                <div className='text-[10px] font-bold text-slate-500 dark:text-gray-500 px-3 py-2 uppercase tracking-[0.2em]'>
                  Conversations
                </div>
                {chats.map((chat) => (
                  <div
                    key={chat._id}
                    className={cn(
                      'group flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all relative overflow-hidden cursor-pointer mx-1',
                      activeChatId === chat._id
                        ? 'bg-blue-600/10 text-slate-900 dark:text-white border border-blue-500/20'
                        : 'text-slate-500 dark:text-gray-400 hover:bg-white/70 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-gray-200 border border-transparent',
                    )}
                    onClick={() => {
                      router.push(`/c/${chat._id}`);
                      if (window.innerWidth < 768) {
                        setIsSidebarOpen(false);
                      }
                    }}
                  >
                    <MessageSquare className='w-4 h-4 flex-shrink-0' />
                    <div className='flex flex-col truncate flex-1'>
                      <span className='truncate font-medium'>
                        {chat.company || 'New Chat'}
                      </span>
                    </div>
                    <button
                      type='button'
                      onClick={(event) => handleDelete(event, chat._id)}
                      className='opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-red-500/20 text-slate-500 dark:text-gray-500 hover:text-red-400 transition-all'
                    >
                      <Trash2 className='w-3.5 h-3.5' />
                    </button>
                  </div>
                ))}
              </div>

              <div className='p-4 border-t border-white/5'>
                <div className='text-[10px] font-bold text-slate-500 dark:text-gray-500 px-3 py-2 uppercase tracking-[0.2em] flex justify-between items-center'>
                  Files & Data
                  <label
                    className={cn(
                      'cursor-pointer hover:text-blue-400 transition-colors',
                      !session && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    <Upload className='w-3 h-3' />
                    <input
                      type='file'
                      accept='.xlsx,.xls,.csv'
                      className='hidden'
                      onChange={handleFileUpload}
                      disabled={!session}
                    />
                  </label>
                </div>

                <div className='px-2 py-2'>
                  <a
                    href='/dummy.csv'
                    download='dummy.csv'
                    className='mb-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white/85 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 hover:border-blue-500/40 text-[11px] font-medium text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white transition-all'
                  >
                    <Download className='w-3.5 h-3.5' />
                    <span>Download Dummy CSV</span>
                  </a>

                  {uploadStep !== 'idle' ? (
                    <div
                      className={cn(
                        'p-3 rounded-xl border flex flex-col gap-2 bg-white/75 dark:bg-black/20',
                        uploadStep === 'error'
                          ? 'border-red-500/20'
                          : 'border-blue-500/20',
                      )}
                    >
                      <div className='flex items-center gap-2'>
                        {uploadStep !== 'success' && uploadStep !== 'error' && (
                          <Sparkles className='w-3.5 h-3.5 text-blue-400 animate-pulse' />
                        )}
                        <span className='text-[10px] font-medium text-slate-700 dark:text-gray-200 uppercase tracking-tighter'>
                          {progressMsg}
                        </span>
                      </div>

                      <div className='w-full h-1 bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden'>
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
                            uploadStep === 'error'
                              ? 'bg-red-500'
                              : 'bg-blue-500',
                          )}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className='text-[10px] text-slate-500 dark:text-gray-500 px-3 leading-relaxed'>
                      Upload Excel or CSV first. Chat stays locked until sheet
                      data is ready.
                    </p>
                  )}
                </div>
              </div>

              <div className='p-4 border-t border-slate-200 dark:border-white/10'>
                <div className='flex items-center justify-between px-2'>
                  <div className='flex items-center gap-3'>
                    {session?.user?.image ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={session.user.image}
                        alt='User'
                        className='w-9 h-9 rounded-full shadow-lg shadow-blue-500/20'
                      />
                    ) : (
                      <div className='w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-bold text-sm shadow-lg shadow-blue-500/20'>
                        {session?.user?.name?.charAt(0) || 'M'}
                      </div>
                    )}
                    <div className='flex flex-col'>
                      <div className='text-sm font-semibold tracking-wide truncate max-w-[120px]'>
                        {session?.user?.name || 'Maifast'}
                      </div>
                      {session && (
                        <div className='text-[10px] text-slate-500 dark:text-gray-500 truncate max-w-[120px]'>
                          {session.user?.email}
                        </div>
                      )}
                    </div>
                  </div>
                  {session ? (
                    <button
                      onClick={() => signOut()}
                      className='p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-white/5 text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors'
                      title='Sign Out'
                    >
                      <LogOut className='w-4 h-4' />
                    </button>
                  ) : (
                    <button
                      onClick={() => signIn('google')}
                      className='p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-white/5 text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors'
                      title='Sign In'
                    >
                      <LogIn className='w-4 h-4' />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className='flex-1 flex flex-col h-full relative w-full overflow-hidden'>
        {!isSidebarOpen && (
          <button
            onClick={() => setIsSidebarOpen(true)}
            className='absolute top-4 left-4 z-50 p-2 rounded-lg bg-white/85 dark:bg-white/10 backdrop-blur-md border border-slate-200 dark:border-white/10 text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors'
          >
            <ChevronRight className='w-5 h-5' />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
