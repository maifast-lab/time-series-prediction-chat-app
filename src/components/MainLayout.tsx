'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  BarChart3,
  MessageSquare,
  ChevronRight,
  Upload,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

// Types
interface ChatSummary {
  _id: string;
  company: string;
  place: string;
  minBound?: number;
  maxBound?: number;
  createdAt: string;
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const router = useRouter();
  const params = useParams();

  useEffect(() => {
    fetchChats();
  }, [params]);

  async function fetchChats() {
    try {
      const res = await fetch('/api/chat');
      if (res.ok) {
        const data = await res.json();
        setChats(data);
      }
    } catch (e) {
      console.error('Failed to fetch chats', e);
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
        // Refresh list
        fetchChats();
        // If current chat was deleted, redirect to new
        if (params?.id === chatId) {
          router.push('/new');
        }
      }
    } catch (error) {
      console.error('Delete failed', error);
    }
  }

  return (
    <div className='flex h-screen w-full bg-[#0a0f1e] text-gray-100 overflow-hidden font-sans selection:bg-blue-500/30'>
      {/* Sidebar */}
      <AnimatePresence mode='wait'>
        {isSidebarOpen && (
          <motion.div
            initial={{ x: -260, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -260, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className='w-[260px] flex-shrink-0 bg-[#000510] border-r border-white/10 flex flex-col h-full'
          >
            {/* New Chat Button */}
            <div className='p-4'>
              <Link
                href='/new'
                className='flex items-center gap-3 px-4 py-3 rounded-lg border border-white/20 hover:border-blue-500/50 hover:bg-white/5 transition-all group'
              >
                <Plus className='w-5 h-5 text-gray-400 group-hover:text-white transition-colors' />
                <span className='text-sm font-medium'>New Series</span>
              </Link>
            </div>

            {/* Chat List */}
            <div className='flex-1 overflow-y-auto no-scrollbar px-2 space-y-2 py-2'>
              <div className='text-xs font-semibold text-gray-500 px-3 py-2 uppercase tracking-wider'>
                History
              </div>
              {chats.map((chat) => (
                <div
                  key={chat._id}
                  className={cn(
                    'group flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-colors relative overflow-hidden cursor-pointer',
                    params?.id === chat._id
                      ? 'bg-white/10 text-white'
                      : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                  )}
                  onClick={() => router.push(`/c/${chat._id}`)}
                >
                  <BarChart3 className='w-4 h-4 flex-shrink-0' />
                  <div className='flex flex-col truncate flex-1'>
                    <span className='truncate font-medium'>{chat.company}</span>
                    <span className='text-xs text-gray-600 truncate'>
                      {chat.place}
                    </span>
                    {(chat.minBound !== undefined ||
                      chat.maxBound !== undefined) && (
                      <div className='flex gap-1 mt-0.5'>
                        {chat.minBound !== undefined && (
                          <span className='text-[10px] text-green-500/70'>
                            min: {chat.minBound}
                          </span>
                        )}
                        {chat.maxBound !== undefined && (
                          <span className='text-[10px] text-purple-500/70'>
                            max: {chat.maxBound}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Delete Button (Visible on hover) */}
                  <button
                    onClick={(e) => handleDelete(e, chat._id)}
                    className='opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-all'
                    title='Delete Chat'
                  >
                    <Trash2 className='w-3.5 h-3.5' />
                  </button>

                  {params?.id === chat._id && (
                    <motion.div
                      layoutId='active-nav'
                      className='absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-blue-500 rounded-r-full'
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Profile / Footer */}
            <div className='p-4 border-t border-white/10'>
              <div className='flex items-center gap-3 px-2'>
                <div className='w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-bold text-xs'>
                  AG
                </div>
                <div className='text-sm font-medium'>Antigravity</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className='flex-1 flex flex-col h-full relative'>
        {/* Toggle Sidebar Button (Mobile/Desktop) */}
        {!isSidebarOpen && (
          <button
            onClick={() => setIsSidebarOpen(true)}
            className='absolute top-4 left-4 z-50 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400'
          >
            <ChevronRight className='w-5 h-5' />
          </button>
        )}

        {children}
      </div>
    </div>
  );
}
