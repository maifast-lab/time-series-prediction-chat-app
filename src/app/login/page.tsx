'use client';

import { getProviders, signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import logoImg from '../logo.jpg';

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [providerIds, setProviderIds] = useState<string[]>([]);

  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/');
    }
  }, [status, router]);

  useEffect(() => {
    const loadProviders = async () => {
      const providers = await getProviders();
      setProviderIds(providers ? Object.keys(providers) : []);
    };
    loadProviders();
  }, []);

  if (status === 'loading') {
    return (
      <div className='h-screen w-full bg-[#0a0f1e] flex items-center justify-center'>
        <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500'></div>
      </div>
    );
  }

  const hasGoogleProvider = providerIds.includes('google');
  const hasLocalDevProvider = providerIds.includes('credentials');

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
          <div className='w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-2xl shadow-blue-500/20 overflow-hidden border border-white/10'>
            <Image src={logoImg} alt="Maifast Logo" className="w-full h-full object-cover" />
          </div>
          <p className='text-gray-400 text-center'>
            Log in to access your personal AI assistant and custom data
            insights.dsf
          </p>
        </div>

        {hasGoogleProvider ? (
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
        ) : null}

        {hasLocalDevProvider ? (
          <button
            onClick={() =>
              signIn('credentials', {
                email: 'local@maifast.dev',
                name: 'Local Developer',
                callbackUrl: '/',
              })
            }
            className='mt-4 w-full flex items-center justify-center px-6 py-4 rounded-2xl border border-blue-400/30 bg-blue-500/10 text-blue-100 font-semibold hover:bg-blue-500/15 transition-all duration-300'
          >
            Continue in Local Dev Mode
          </button>
        ) : null}

        {!hasGoogleProvider && hasLocalDevProvider ? (
          <p className='mt-4 text-sm text-blue-200/70 text-center'>
            Google OAuth is not fully configured for this local environment, so
            the dev login button is enabled.
          </p>
        ) : null}

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
