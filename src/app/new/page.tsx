'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import { motion } from 'framer-motion';
import { ArrowRight, Globe, Building2 } from 'lucide-react';

export default function NewChat() {
  const [company, setCompany] = useState('');
  const [place, setPlace] = useState('');
  const [minBound, setMinBound] = useState('');
  const [maxBound, setMaxBound] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!company || !place) return;

    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company,
          place,
          minBound: minBound || undefined,
          maxBound: maxBound || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/c/${data._id}`);
      } else {
        const err = await res.json();
        alert(err.error);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <MainLayout>
      <div className='flex-1 flex flex-col items-center justify-center p-4'>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className='w-full max-w-md'
        >
          <div className='text-center mb-10'>
            <div className='w-16 h-16 bg-white/5 rounded-2xl mx-auto flex items-center justify-center mb-6 border border-white/10 shadow-2xl shadow-blue-900/20'>
              <Globe className='w-8 h-8 text-blue-400' />
            </div>
            <h1 className='text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-white to-gray-400'>
              Create New Time-Series
            </h1>
            <p className='text-gray-500 mt-2'>
              Start tracking a new metric for a specific location.
            </p>
          </div>

          <form onSubmit={handleSubmit} className='space-y-4'>
            <div className='space-y-2'>
              <label className='text-xs text-gray-500 font-medium ml-1'>
                COMPANY / METRIC
              </label>
              <div className='relative group'>
                <Building2 className='absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600 group-focus-within:text-blue-500 transition-colors' />
                <input
                  type='text'
                  placeholder='e.g. Starbucks'
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className='w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all'
                  required
                />
              </div>
            </div>

            <div className='space-y-2'>
              <label className='text-xs text-gray-500 font-medium ml-1'>
                PLACE / REGION
              </label>
              <div className='relative group'>
                <Globe className='absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600 group-focus-within:text-purple-500 transition-colors' />
                <input
                  type='text'
                  placeholder='e.g. Seattle, WA'
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  className='w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent transition-all'
                  required
                />
              </div>
            </div>

            <div className='grid grid-cols-2 gap-4'>
              <div className='space-y-2'>
                <label className='text-xs text-gray-500 font-medium ml-1'>
                  MIN BOUND (OPTIONAL)
                </label>
                <div className='relative group'>
                  <input
                    type='text'
                    placeholder='None'
                    value={minBound}
                    onChange={(e) => setMinBound(e.target.value)}
                    className='w-full bg-white/5 border border-white/10 rounded-xl py-4 px-4 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all'
                  />
                </div>
              </div>
              <div className='space-y-2'>
                <label className='text-xs text-gray-500 font-medium ml-1'>
                  MAX BOUND (OPTIONAL)
                </label>
                <div className='relative group'>
                  <input
                    type='text'
                    placeholder='None'
                    value={maxBound}
                    onChange={(e) => setMaxBound(e.target.value)}
                    className='w-full bg-white/5 border border-white/10 rounded-xl py-4 px-4 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent transition-all'
                  />
                </div>
              </div>
            </div>

            <button
              type='submit'
              disabled={loading}
              className='w-full mt-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium py-4 rounded-xl shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed'
            >
              {loading ? (
                'Creating...'
              ) : (
                <>
                  Start Tracking <ArrowRight className='w-4 h-4' />
                </>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    </MainLayout>
  );
}
