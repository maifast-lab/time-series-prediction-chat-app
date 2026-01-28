'use client';

import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { MessageSquare, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className='h-screen w-full bg-[#0a0f1e] flex items-center justify-center'>
        <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500'></div>
      </div>
    );
  }

  return (
    <div className='h-screen w-full bg-[#0a0f1e] text-gray-100 flex flex-col items-center justify-center p-4 relative overflow-hidden'>
      {/* Decorative background elements */}
      <div className='absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none' />
      <div className='absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none' />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className='w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl relative z-10'
      >
        <div className='flex flex-col items-center mb-8'>
          <div className='w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mb-6 shadow-2xl shadow-blue-500/20'>
            <MessageSquare className='w-8 h-8 text-white' />
          </div>
          <h1 className='text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400 mb-2'>
            Maifast AI
          </h1>
          <p className='text-gray-400 text-center'>
            Log in to access your personal AI assistant and custom data
            insights.
          </p>
        </div>

        <button
          onClick={() => signIn('google', { callbackUrl: '/' })}
          className='w-full group relative flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-white text-[#0a0f1e] font-bold text-lg hover:bg-gray-100 transition-all duration-300 shadow-xl'
        >
          <img
            src='https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg'
            alt='Google'
            className='w-6 h-6'
          />
          Sign in with Google
          <Sparkles className='absolute right-6 w-5 h-5 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-blue-500' />
        </button>

        <div className='mt-8 pt-6 border-t border-white/5 text-center'>
          <p className='text-sm text-gray-500 flex items-center justify-center gap-1'>
            Secure, professional-grade AI platform.
          </p>
        </div>
      </motion.div>

      <div className='mt-8 text-gray-500 text-sm font-medium tracking-widest uppercase flex items-center gap-4'>
        <div className='h-[1px] w-8 bg-gray-500/30' />
        Powering human-data interaction
        <div className='h-[1px] w-8 bg-gray-500/30' />
      </div>
    </div>
  );
}
