'use client';

import { Moon, Sun } from 'lucide-react';

import { useTheme } from '@/components/providers/ThemeProvider';
import { Button } from '@/components/ui/button';

export default function ThemeToggle() {
  const { toggleTheme } = useTheme();

  return (
    <Button
      type='button'
      variant='outline'
      size='sm'
      onClick={toggleTheme}
      aria-label='Toggle theme'
      className='fixed right-4 top-4 z-[80] rounded-full border border-white/60 bg-white/90 px-4 shadow-lg shadow-slate-200/60 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/75 dark:shadow-black/20'
    >
      <Sun className='h-4 w-4 text-amber-500' />
      <Moon className='h-4 w-4 text-slate-500 dark:text-slate-300' />
      <span>Theme</span>
    </Button>
  );
}
