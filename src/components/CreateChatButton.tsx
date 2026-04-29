'use client';

import { useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

import { createChatAction } from '@/app/actions/chat';
import { logger } from '@/lib/logger';

interface CreateChatButtonProps {
  children: ReactNode;
  className: string;
}

export default function CreateChatButton({
  children,
  className,
}: CreateChatButtonProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type='button'
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          if (!session?.user?.dbId) {
            router.push('/login');
            return;
          }

          const result = await createChatAction();
          if (!result.ok) {
            logger.error('Start conversation failed', result.error);
            return;
          }

          router.push(`/c/${result.data._id}`);
        });
      }}
      className={className}
    >
      {children}
    </button>
  );
}
