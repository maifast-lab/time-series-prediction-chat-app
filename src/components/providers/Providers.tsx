'use client';

import { ThemeProvider } from '@/components/providers/ThemeProvider';
import ThemeToggle from '@/components/providers/ThemeToggle';
import { Toaster } from '@/components/ui/sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      {children}
      <Toaster position='top-right' richColors closeButton />
      <ThemeToggle />
    </ThemeProvider>
  );
}
