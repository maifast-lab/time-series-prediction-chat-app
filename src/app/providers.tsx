'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { ThemeProvider } from '@/components/providers/ThemeProvider';
import ThemeToggle from '@/components/providers/ThemeToggle';
import { Toaster } from '@/components/ui/sonner';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 30_000,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {children}
        <Toaster position='top-right' richColors closeButton />
        <ThemeToggle />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
