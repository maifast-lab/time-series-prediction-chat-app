'use client';

import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { logger } from '@/lib/logger';
import { useSession, signIn, signOut } from 'next-auth/react';

interface ChatSummary {
  _id: string;
  company: string;
  place: string;
  createdAt: string;
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [uploadStep, setUploadStep] = useState<
    'idle' | 'analyzing' | 'processing' | 'success' | 'error'
  >('idle');
  const [progressMsg, setProgressMsg] = useState('');
  const { data: session } = useSession();

  const router = useRouter();
  const params = useParams();

  useEffect(() => {
    fetchChats();
  }, [params]);

  useEffect(() => {
    const handleUpdate = () => fetchChats();
    window.addEventListener('chat-updated', handleUpdate);
    return () => window.removeEventListener('chat-updated', handleUpdate);
  }, []);

  async function fetchChats() {
    try {
      const res = await fetch('/api/chat');
      if (res.ok) {
        const data = await res.json();
        setChats(data);
      }
    } catch (e) {
      logger.error('Failed to fetch chats', e);
    }
  }

  async function handleDelete(e: React.MouseEvent, chatId: string) {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this chat?')) return;

    try {
      const res = await fetch(`/api/chat/${chatId}/delete`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchChats();
        if (params?.id === chatId) {
          router.push('/');
        }
      }
    } catch (error) {
      logger.error('Delete failed', error);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStep('analyzing');
    setProgressMsg('AI is analyzing format...');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/datasource/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        setUploadStep('processing');
        setProgressMsg('Bulk mapping 100% complete...');
        setTimeout(() => {
          setUploadStep('success');
          setProgressMsg('Data ready for AI chat!');
          setTimeout(() => setUploadStep('idle'), 3000);
          fetchChats();
        }, 800);
      } else {
        const errData = await res.json().catch(() => ({}));
        setUploadStep('error');
        setProgressMsg(errData.error || 'Format analyze failed.');
        setTimeout(() => setUploadStep('idle'), 5000);
      }
    } catch {
      setUploadStep('error');
      setProgressMsg('Network error.');
      setTimeout(() => setUploadStep('idle'), 3000);
    }
  }

  return (
    <div className='flex h-screen w-full bg-[#0a0f1e] text-gray-100 overflow-hidden font-sans selection:bg-blue-500/30'>
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className='md:hidden fixed top-4 left-4 z-[60] p-2 rounded-lg bg-white/10 backdrop-blur-md border border-white/10 text-gray-400'
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
              className='fixed inset-0 bg-black/60 backdrop-blur-sm z-[45] md:hidden'
            />
            <motion.div
              initial={{ x: -260, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -260, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className='fixed md:relative w-[280px] md:w-[260px] flex-shrink-0 bg-[#000510]/80 backdrop-blur-xl border-r border-white/10 flex flex-col h-full z-50'
            >
              <div className='p-4 pt-16 md:pt-4'>
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/chat', { method: 'POST' });
                      if (res.ok) {
                        const data = await res.json();
                        router.push(`/c/${data._id}`);
                        if (window.innerWidth < 768) setIsSidebarOpen(false);
                      }
                    } catch (e) {
                      logger.error('New chat creation failed', e);
                    }
                  }}
                  className='w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:border-blue-500/50 hover:bg-white/10 transition-all group text-left'
                >
                  <Plus className='w-5 h-5 text-gray-400 group-hover:text-white transition-colors' />
                  <span className='text-sm font-medium'>New Chat</span>
                </button>
              </div>

              <div className='flex-1 overflow-y-auto no-scrollbar px-2 space-y-2 py-2'>
                <div className='text-[10px] font-bold text-gray-500 px-3 py-2 uppercase tracking-[0.2em]'>
                  Conversations
                </div>
                {chats.map((chat) => (
                  <div
                    key={chat._id}
                    className={cn(
                      'group flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all relative overflow-hidden cursor-pointer mx-1',
                      params?.id === chat._id
                        ? 'bg-blue-600/10 text-white border border-blue-500/20'
                        : 'text-gray-400 hover:bg-white/5 hover:text-gray-200 border border-transparent',
                    )}
                    onClick={() => {
                      router.push(`/c/${chat._id}`);
                      if (window.innerWidth < 768) setIsSidebarOpen(false);
                    }}
                  >
                    <MessageSquare className='w-4 h-4 flex-shrink-0' />
                    <div className='flex flex-col truncate flex-1'>
                      <span className='truncate font-medium'>
                        {chat.company || 'New Chat'}
                      </span>
                    </div>
                    <button
                      onClick={(e) => handleDelete(e, chat._id)}
                      className='opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-all'
                    >
                      <Trash2 className='w-3.5 h-3.5' />
                    </button>
                  </div>
                ))}
              </div>

              <div className='p-4 border-t border-white/5'>
                <div className='text-[10px] font-bold text-gray-500 px-3 py-2 uppercase tracking-[0.2em] flex justify-between items-center'>
                  Files & Data
                  <label className='cursor-pointer hover:text-blue-400 transition-colors'>
                    <Upload className='w-3 h-3' />
                    <input
                      type='file'
                      className='hidden'
                      onChange={handleFileUpload}
                    />
                  </label>
                </div>

                <div className='px-2 py-2'>
                  {uploadStep !== 'idle' ? (
                    <div
                      className={cn(
                        'p-3 rounded-xl border flex flex-col gap-2 bg-black/20',
                        uploadStep === 'error'
                          ? 'border-red-500/20'
                          : 'border-blue-500/20',
                      )}
                    >
                      <div className='flex items-center gap-2'>
                        {uploadStep !== 'success' && uploadStep !== 'error' && (
                          <Sparkles className='w-3.5 h-3.5 text-blue-400 animate-pulse' />
                        )}
                        <span className='text-[10px] font-medium text-gray-200 uppercase tracking-tighter'>
                          {progressMsg}
                        </span>
                      </div>
                      <div className='w-full h-1 bg-white/5 rounded-full overflow-hidden'>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{
                            width:
                              uploadStep === 'analyzing'
                                ? '40%'
                                : uploadStep === 'processing'
                                  ? '90%'
                                  : uploadStep === 'success'
                                    ? '100%'
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
                    <p className='text-[10px] text-gray-500 px-3 leading-relaxed'>
                      Upload documents to chat with your private data.
                    </p>
                  )}
                </div>
              </div>

              <div className='p-4 border-t border-white/10'>
                <div className='flex items-center justify-between px-2'>
                  <div className='flex items-center gap-3'>
                    {session?.user?.image ? (
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
                        <div className='text-[10px] text-gray-500 truncate max-w-[120px]'>
                          {session.user?.email}
                        </div>
                      )}
                    </div>
                  </div>
                  {session ? (
                    <button
                      onClick={() => signOut()}
                      className='p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors'
                      title='Sign Out'
                    >
                      <LogOut className='w-4 h-4' />
                    </button>
                  ) : (
                    <button
                      onClick={() => signIn('google')}
                      className='p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors'
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
            className='absolute top-4 left-4 z-50 p-2 rounded-lg bg-white/10 backdrop-blur-md border border-white/10 text-gray-400 hover:text-white transition-colors'
          >
            <ChevronRight className='w-5 h-5' />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
