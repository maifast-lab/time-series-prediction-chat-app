'use client';

import type { ChangeEventHandler } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import SidebarAuthPanel from '@/components/main-layout/SidebarAuthPanel';
import SidebarBrand from '@/components/main-layout/SidebarBrand';
import SidebarChatList from '@/components/main-layout/SidebarChatList';
import SidebarFileActions from '@/components/main-layout/SidebarFileActions';
import SidebarNewChatButton from '@/components/main-layout/SidebarNewChatButton';
import type { UploadStep } from '@/components/main-layout/types';
import type { StoredAuthState } from '@/lib/auth-client';
import type { ChatSummary } from '@/lib/chat-types';

interface MainLayoutSidebarProps {
  isSidebarOpen: boolean;
  isCreatingChat: boolean;
  chats: ChatSummary[];
  activeChatId: string | null;
  uploadStep: UploadStep;
  progressMessage: string;
  authState: StoredAuthState | null;
  isAuthLoading: boolean;
  isSigningOut: boolean;
  apiHostLabel: string;
  onCloseSidebar: () => void;
  onCreateChat: () => void;
  onOpenChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onUploadFile: ChangeEventHandler<HTMLInputElement>;
  onDownloadSample: () => void;
  onOpenSheetEditor: () => void;
  onOpenSignIn: () => void;
  onSignOut: () => void;
}

export default function MainLayoutSidebar({
  isSidebarOpen,
  isCreatingChat,
  chats,
  activeChatId,
  uploadStep,
  progressMessage,
  authState,
  isAuthLoading,
  isSigningOut,
  apiHostLabel,
  onCloseSidebar,
  onCreateChat,
  onOpenChat,
  onDeleteChat,
  onUploadFile,
  onDownloadSample,
  onOpenSheetEditor,
  onOpenSignIn,
  onSignOut,
}: MainLayoutSidebarProps) {
  return (
    <AnimatePresence mode='wait'>
      {isSidebarOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCloseSidebar}
            className='fixed inset-0 z-[45] bg-slate-900/25 backdrop-blur-sm dark:bg-black/60 md:hidden'
          />

          <motion.div
            initial={{ x: -260, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -260, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className='fixed z-50 flex h-full w-[280px] flex-shrink-0 flex-col border-r border-slate-200 bg-white/88 shadow-xl shadow-slate-200/60 backdrop-blur-xl dark:bg-[#000510]/80 dark:shadow-none md:relative md:w-[260px] dark:border-white/10'
          >
            <div className='flex flex-col gap-6 p-4 pt-16 md:pt-4'>
              <SidebarBrand />
              <SidebarNewChatButton
                isCreatingChat={isCreatingChat}
                onCreateChat={onCreateChat}
              />
            </div>

            <SidebarChatList
              chats={chats}
              activeChatId={activeChatId}
              onOpenChat={onOpenChat}
              onDeleteChat={onDeleteChat}
            />

            <SidebarFileActions
              onUploadFile={onUploadFile}
              onDownloadSample={onDownloadSample}
              onOpenSheetEditor={onOpenSheetEditor}
              uploadStep={uploadStep}
              progressMessage={progressMessage}
            />

            <SidebarAuthPanel
              authState={authState}
              isAuthLoading={isAuthLoading}
              isSigningOut={isSigningOut}
              apiHostLabel={apiHostLabel}
              onOpenSignIn={onOpenSignIn}
              onSignOut={onSignOut}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
