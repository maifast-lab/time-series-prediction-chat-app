'use client';

import { Toaster as Sonner, type ToasterProps } from 'sonner';

import { useTheme } from '@/components/providers/ThemeProvider';

export function Toaster(props: ToasterProps) {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme}
      className='toaster group'
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:border-border group-[.toaster]:bg-background/95 group-[.toaster]:text-foreground group-[.toaster]:shadow-xl group-[.toaster]:backdrop-blur-xl',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
}
