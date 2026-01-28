'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import { Sparkles, MessageSquare } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkLatest() {
      try {
        const res = await fetch('/api/chat');
        if (res.ok) {
          const chats = await res.json();
          if (chats.length > 0) {
            router.push(`/c/${chats[0]._id}`);
          } else {
            setLoading(false);
          }
        }
      } catch (e) {
        setLoading(false);
      }
    }
    checkLatest();
  }, [router]);

  if (loading) return null;

  return (
    <MainLayout>
      <div className='flex-1 flex flex-col items-center justify-center p-6 text-center'>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className='max-w-2xl'
        >
          <div className='w-20 h-20 bg-blue-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-blue-500/20'>
            <Sparkles className='w-10 h-10 text-blue-400' />
          </div>

          <h1 className='text-4xl font-bold text-white mb-4 tracking-tight text-center md:text-5xl'>
            Welcome to <span className='text-blue-500'>Maifast</span>
          </h1>
          <p className='text-gray-400 text-lg mb-10 leading-relaxed font-light mx-auto max-w-lg'>
            Your premium AI companion for intelligent conversations, task
            automation, and instant insights.
          </p>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-4 text-left'>
            <div className='p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors'>
              <MessageSquare className='w-6 h-6 text-blue-400 mb-3' />
              <div className='text-white font-semibold mb-1'>
                Natural Conversations
              </div>
              <p className='text-xs text-gray-500'>
                Chat naturally with an AI that understands context and detail.
              </p>
            </div>
            <div className='p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors'>
              <Sparkles className='w-6 h-6 text-purple-400 mb-3' />
              <div className='text-white font-semibold mb-1'>
                Instant Insights
              </div>
              <p className='text-xs text-gray-500'>
                Get answers, creative ideas, and technical help in seconds.
              </p>
            </div>
          </div>

          <button
            onClick={async () => {
              const res = await fetch('/api/chat', { method: 'POST' });
              if (res.ok) {
                const data = await res.json();
                router.push(`/c/${data._id}`);
              }
            }}
            className='mt-12 px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold shadow-xl shadow-blue-900/20 transition-all active:scale-95'
          >
            Start Your First Conversation
          </button>
        </motion.div>
      </div>
    </MainLayout>
  );
}
