'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogOut } from 'lucide-react';
import type { VariantProps } from 'class-variance-authority';

import { Button, buttonVariants } from '@/components/ui/button';
import { signOut } from '@/lib/auth-client';

interface LogoutButtonProps extends VariantProps<typeof buttonVariants> {
  className?: string;
}

export default function LogoutButton({
  className = '',
  size,
  variant = 'outline',
}: LogoutButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function handleLogout() {
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      await signOut();
      router.replace('/login');
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className='space-y-2'>
      <Button
        type='button'
        variant={variant}
        size={size}
        onClick={handleLogout}
        disabled={isSubmitting}
        className={className}
      >
        {isSubmitting ? (
          <Loader2 className='h-4 w-4 animate-spin' />
        ) : (
          <LogOut className='h-4 w-4' />
        )}
        <span>{isSubmitting ? 'Logging Out...' : 'Log Out'}</span>
      </Button>

      {errorMessage ? (
        <p className='text-sm text-red-600 dark:text-red-400'>{errorMessage}</p>
      ) : null}
    </div>
  );
}
