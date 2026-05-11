'use client';

import type { ChangeEventHandler } from 'react';

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
  isSuggestionPage: boolean;
  uploadStep: UploadStep;
  progressMessage: string;
  hasSheetData: boolean;
  isCheckingSheetData: boolean;
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
  onOpenSuggestionPage: () => void;
  onOpenSignIn: () => void;
  onSignOut: () => void;
}

export default function MainLayoutSidebar({
  isSidebarOpen,
  isCreatingChat,
  chats,
  activeChatId,
  isSuggestionPage,
  uploadStep,
  progressMessage,
  hasSheetData,
  isCheckingSheetData,
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
  onOpenSuggestionPage,
  onOpenSignIn,
  onSignOut,
}: MainLayoutSidebarProps) {
  return (
    <>
      {isSidebarOpen ? (
        <div
          onClick={onCloseSidebar}
          className='fixed inset-0 z-[45] bg-slate-900/25 backdrop-blur-sm transition-opacity duration-300 md:hidden dark:bg-black/60'
        />
      ) : null}

      <div
        className='fixed z-50 flex h-full w-[280px] transform-gpu flex-shrink-0 flex-col border-r border-slate-200 bg-white/88 shadow-xl shadow-slate-200/60 backdrop-blur-xl transition-transform duration-300 md:relative md:w-[260px] dark:border-white/10 dark:bg-[#000510]/80 dark:shadow-none'
        style={{
          transform: isSidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          pointerEvents: isSidebarOpen ? 'auto' : 'none',
        }}
      >
        <div className='flex flex-col gap-6 p-4 pt-16 md:pt-4'>
          <SidebarBrand />
        <SidebarNewChatButton
          isCreatingChat={isCreatingChat}
          isCheckingSheetData={isCheckingSheetData}
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
          onOpenSuggestionPage={onOpenSuggestionPage}
          isSuggestionPage={isSuggestionPage}
          uploadStep={uploadStep}
          progressMessage={progressMessage}
          hasSheetData={hasSheetData}
          isCheckingSheetData={isCheckingSheetData}
        />

        <SidebarAuthPanel
          authState={authState}
          isAuthLoading={isAuthLoading}
          isSigningOut={isSigningOut}
          apiHostLabel={apiHostLabel}
          onOpenSignIn={onOpenSignIn}
          onSignOut={onSignOut}
        />
      </div>
    </>
  );
}
