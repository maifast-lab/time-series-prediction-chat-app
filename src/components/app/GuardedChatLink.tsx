'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type MouseEvent,
} from 'react';
import { toast } from 'sonner';

import { useSheetDataStatus } from '@/components/sheet-editor/sheet-editor-queries';

interface GuardedChatLinkProps
  extends Omit<ComponentPropsWithoutRef<typeof Link>, 'href' | 'onClick'> {
  chatId: string;
}

const GuardedChatLink = forwardRef<HTMLAnchorElement, GuardedChatLinkProps>(
  function GuardedChatLink({ chatId, children, ...props }, ref) {
    const router = useRouter();
    const sheetStatusQuery = useSheetDataStatus(true);
    const href = `/c/${chatId}`;

    function handleClick(event: MouseEvent<HTMLAnchorElement>) {
      event.preventDefault();

      if (!sheetStatusQuery.data && sheetStatusQuery.isLoading) {
        toast.info('Checking sheet data...', {
          description: 'Please wait while we confirm your uploaded data.',
        });
        return;
      }

      if (!sheetStatusQuery.data?.hasSheetData) {
        toast.error('Upload sheet data first', {
          description: 'Upload CSV or Excel data before opening chat.',
        });
        return;
      }

      router.push(href);
    }

    return (
      <Link ref={ref} href={href} onClick={handleClick} {...props}>
        {children}
      </Link>
    );
  },
);

export default GuardedChatLink;
