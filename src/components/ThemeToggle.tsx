'use client';

import { Moon, Sun } from 'lucide-react';

import { useTheme } from '@/components/ThemeProvider';

export default function ThemeToggle() {
  const { toggleTheme } = useTheme();

  return (
    <button
      type='button'
      onClick={toggleTheme}
      aria-label='Toggle theme'
      className='fixed top-4 right-4 z-[80] inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 shadow-lg shadow-slate-200/60 backdrop-blur-xl transition-all hover:bg-white hover:text-slate-900 dark:border-white/10 dark:bg-slate-950/75 dark:text-slate-100 dark:shadow-black/20 dark:hover:bg-slate-900'
    >
      <Sun className='h-4 w-4 text-amber-500' />
      <Moon className='h-4 w-4 text-slate-500 dark:text-slate-300' />
      <span>Theme</span>
    </button>
  );
}
