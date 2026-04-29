import { LogIn, LogOut } from 'lucide-react';

import type { StoredAuthState } from '@/lib/auth-client';

interface SidebarAuthPanelProps {
  authState: StoredAuthState | null;
  isAuthLoading: boolean;
  isSigningOut: boolean;
  apiHostLabel: string;
  onOpenSignIn: () => void;
  onSignOut: () => void;
}

export default function SidebarAuthPanel({
  authState,
  isAuthLoading,
  isSigningOut,
  apiHostLabel,
  onOpenSignIn,
  onSignOut,
}: SidebarAuthPanelProps) {
  return (
    <div className='border-t border-slate-200 p-4 dark:border-white/10'>
      <div className='flex items-center justify-between gap-3 px-2'>
        <div className='flex min-w-0 items-center gap-3'>
          {authState?.user?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={authState.user.image}
              alt={authState.user.name || 'User'}
              className='h-9 w-9 rounded-full shadow-lg shadow-blue-500/20'
            />
          ) : (
            <div className='flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 text-sm font-bold text-white shadow-lg shadow-blue-500/20'>
              {authState?.user?.name?.charAt(0)?.toUpperCase() || 'A'}
            </div>
          )}
          <div className='min-w-0'>
            <div className='truncate text-sm font-semibold tracking-wide'>
              {isAuthLoading ? 'Checking login...' : authState?.user?.name || 'Guest'}
            </div>
            <div className='truncate text-[10px] text-slate-500 dark:text-gray-500'>
              {authState?.user?.email || apiHostLabel}
            </div>
          </div>
        </div>

        {authState ? (
          <button
            type='button'
            aria-label='Sign out'
            onClick={onSignOut}
            disabled={isSigningOut}
            className='rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900 disabled:opacity-60 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white'
            title='Sign Out'
          >
            <LogOut className='h-4 w-4' />
          </button>
        ) : (
          <button
            type='button'
            aria-label='Open login'
            onClick={onOpenSignIn}
            className='rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white'
            title='Open Login'
          >
            <LogIn className='h-4 w-4' />
          </button>
        )}
      </div>
    </div>
  );
}
