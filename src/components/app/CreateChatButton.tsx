'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { VariantProps } from 'class-variance-authority';

import { useSheetDataStatus } from '@/components/sheet-editor/sheet-editor-queries';
import { Button, buttonVariants } from '@/components/ui/button';
import { ApiClientError } from '@/lib/api-client';
import { useCreateChatMutation } from '@/lib/api-hooks';
import { clearStoredAuth } from '@/lib/auth-client';
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
  const sheetStatusQuery = useSheetDataStatus(true);
  const createChatMutation = useCreateChatMutation();
  const hasSheetData = Boolean(sheetStatusQuery.data?.hasSheetData);
  const isPending = createChatMutation.isPending;
  const isCheckingSheetData =
    !sheetStatusQuery.data &&
    (sheetStatusQuery.isLoading || sheetStatusQuery.isFetching);
  const isDisabled = isPending || isCheckingSheetData || !hasSheetData;
  const sheetStatusErrorMessage =
    sheetStatusQuery.error instanceof Error &&
    !(
      sheetStatusQuery.error instanceof ApiClientError &&
      sheetStatusQuery.error.status === 401
    )
      ? sheetStatusQuery.error.message
      : '';
  const visibleErrorMessage = errorMessage || sheetStatusErrorMessage;

  useEffect(() => {
    const error = sheetStatusQuery.error;

    if (error instanceof ApiClientError && error.status === 401) {
      clearStoredAuth();
      router.push('/login');
    }
  }, [router, sheetStatusQuery.error]);

  return (
    <div className='space-y-3'>
      <Button
        type='button'
        variant={variant}
        size={size}
        disabled={isDisabled}
        className={className}
        onClick={async () => {
          setErrorMessage('');

          if (!hasSheetData) {
            setErrorMessage('Upload sheet data before starting a conversation.');
            return;
          }

          try {
            const chat = await createChatMutation.mutateAsync();
            router.push(`/c/${chat._id}`);
          } catch (error) {
            if (error instanceof ApiClientError && error.status === 401) {
              clearStoredAuth();
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
        }}
      >
        {isPending ? <Loader2 className='size-4 animate-spin' /> : null}
        {children}
      </Button>

      {!sheetStatusQuery.isLoading && !hasSheetData ? (
        <p className='text-sm text-slate-500 dark:text-slate-400'>
          Upload a CSV or Excel file before starting a chat.
        </p>
      ) : null}

      {visibleErrorMessage ? (
        <p className='text-sm text-red-600 dark:text-red-400'>
          {visibleErrorMessage}
        </p>
      ) : null}
    </div>
  );
}
