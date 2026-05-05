'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { VariantProps } from 'class-variance-authority';

import { Button, buttonVariants } from '@/components/ui/button';
import { ApiClientError, requestApi } from '@/lib/api-client';
import type { ChatSummary } from '@/lib/chat-types';
import { logger } from '@/lib/logger';

interface CreateChatButtonProps extends VariantProps<typeof buttonVariants> {
  children: ReactNode;
  className?: string;
}

export default function CreateChatButton({
  children,
  className,
  size,
  variant,
}: CreateChatButtonProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  return (
    <div className='space-y-3'>
      <Button
        type='button'
        variant={variant}
        size={size}
        disabled={isPending}
        className={className}
        onClick={() => {
          setErrorMessage('');

          startTransition(async () => {
            try {
              const chat = await requestApi<ChatSummary>('/api/chats', {
                method: 'POST',
              });

              router.push(`/c/${chat._id}`);
            } catch (error) {
              if (error instanceof ApiClientError && error.status === 401) {
                router.push('/login');
                return;
              }

              if (error instanceof ApiClientError) {
                setErrorMessage(error.message);
                logger.warn('Start conversation failed', {
                  status: error.status,
                  error: error.message,
                });
                return;
              }

              setErrorMessage('Could not start conversation. Please try again.');
              logger.error('Start conversation failed', error);
            }
          });
        }}
      >
        {isPending ? <Loader2 className='size-4 animate-spin' /> : null}
        {children}
      </Button>

      {errorMessage ? (
        <p className='text-sm text-red-600 dark:text-red-400'>{errorMessage}</p>
      ) : null}
    </div>
  );
}
