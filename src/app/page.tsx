import { redirect } from 'next/navigation';
import Image from 'next/image';
import { MessageSquare, Sparkles } from 'lucide-react';

import MainLayout from '@/components/MainLayout';
import CreateChatButton from '@/components/CreateChatButton';
import { getChatsForCurrentUser, getLatestChatIdForCurrentUser } from '@/lib/server/chat';

import logoImg from './logo.jpg';

export default async function Home() {
  const [latestChatId, chats] = await Promise.all([
    getLatestChatIdForCurrentUser(),
    getChatsForCurrentUser(),
  ]);

  if (latestChatId) {
    redirect(`/c/${latestChatId}`);
  }

  return (
    <MainLayout initialChats={chats}>
      <div className='flex-1 flex flex-col items-center justify-center p-6 text-center'>
        <div className='max-w-2xl'>
          <div className='w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-slate-200 dark:border-white/10 overflow-hidden shadow-2xl shadow-blue-500/20'>
            <Image
              src={logoImg}
              alt='Maifast Logo'
              className='w-full h-full object-cover'
            />
          </div>

          <h1 className='text-4xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight text-center md:text-5xl'>
            Welcome to <span className='text-blue-500'>Maifast</span>
          </h1>
          <p className='text-slate-600 dark:text-gray-400 text-lg mb-10 leading-relaxed font-light mx-auto max-w-lg'>
            Your premium AI companion for intelligent conversations, task
            automation, and instant insights.
          </p>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-4 text-left'>
            <div className='p-6 rounded-2xl bg-white/80 border border-slate-200 shadow-sm shadow-slate-200/70 hover:bg-white transition-colors dark:bg-white/5 dark:border-white/10 dark:shadow-none dark:hover:bg-white/10'>
              <MessageSquare className='w-6 h-6 text-blue-400 mb-3' />
              <div className='text-slate-900 dark:text-white font-semibold mb-1'>
                Natural Conversations
              </div>
              <p className='text-xs text-slate-500 dark:text-gray-500'>
                Chat naturally with an AI that understands context and detail.
              </p>
            </div>
            <div className='p-6 rounded-2xl bg-white/80 border border-slate-200 shadow-sm shadow-slate-200/70 hover:bg-white transition-colors dark:bg-white/5 dark:border-white/10 dark:shadow-none dark:hover:bg-white/10'>
              <Sparkles className='w-6 h-6 text-purple-400 mb-3' />
              <div className='text-slate-900 dark:text-white font-semibold mb-1'>
                Instant Insights
              </div>
              <p className='text-xs text-slate-500 dark:text-gray-500'>
                Get answers, creative ideas, and technical help in seconds.
              </p>
            </div>
          </div>

          <CreateChatButton className='mt-12 px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold shadow-xl shadow-blue-900/20 transition-all active:scale-95 disabled:opacity-60'>
            Start Your First Conversation
          </CreateChatButton>
        </div>
      </div>
    </MainLayout>
  );
}
