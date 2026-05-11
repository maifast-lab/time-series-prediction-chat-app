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

type GuardedSheetEditorLinkProps = Omit<
  ComponentPropsWithoutRef<typeof Link>,
  'href' | 'onClick'
>;

const GuardedSheetEditorLink = forwardRef<
  HTMLAnchorElement,
  GuardedSheetEditorLinkProps
>(function GuardedSheetEditorLink({ children, ...props }, ref) {
  const router = useRouter();
  const sheetStatusQuery = useSheetDataStatus(true);

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
        description: 'Upload CSV or Excel data before editing sheet rows.',
      });
      return;
    }

    router.push('/edit/sheet');
  }

  return (
    <Link ref={ref} href='/edit/sheet' onClick={handleClick} {...props}>
      {children}
    </Link>
  );
});

export default GuardedSheetEditorLink;
