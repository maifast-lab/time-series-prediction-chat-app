'use client';

import { useEffect, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import MainLayoutSidebar from '@/components/main-layout/MainLayoutSidebar';
import SidebarToggleButton from '@/components/main-layout/SidebarToggleButton';
import type { UploadStep } from '@/components/main-layout/types';
import { Button } from '@/components/ui/button';
import {
  useSheetDataStatus,
  useUploadDataSourceMutation,
} from '@/components/sheet-editor/sheet-editor-queries';
import { API_BASE_URL } from '@/lib/api-base-url';
import { ApiClientError } from '@/lib/api-client';
import {
  apiQueryKeys,
  useChatsOverviewQuery,
  useCreateChatMutation,
  useDeleteChatMutation,
  useRenameChatByIdMutation,
} from '@/lib/api-hooks';
import {
  CHAT_RENAMED_EVENT,
  DATA_SOURCE_UPLOADED_EVENT,
  type ChatRenamedEventDetail,
} from '@/lib/app-events';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AUTH_STATE_CHANGED_EVENT,
  clearStoredAuth,
  getStoredAuth,
  signOut,
  type StoredAuthState,
} from '@/lib/auth-client';
import type { ChatsOverviewData, ChatSummary } from '@/lib/chat-types';
import { logger } from '@/lib/logger';

interface MainLayoutClientProps {
  children: React.ReactNode;
  initialChats: ChatSummary[];
}

function getActiveChatId(params: ReturnType<typeof useParams>) {
  if (typeof params?.id === 'string') {
    return params.id;
  }

  if (Array.isArray(params?.id)) {
    return params.id[0] ?? null;
  }

  return null;
}

export default function MainLayoutClient({
  children,
  initialChats,
}: MainLayoutClientProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [uploadStep, setUploadStep] = useState<UploadStep>('idle');
  const [progressMessage, setProgressMessage] = useState('');
  const [renameChatId, setRenameChatId] = useState<string | null>(null);
  const [renameChatName, setRenameChatName] = useState('');
  const [deleteChatId, setDeleteChatId] = useState<string | null>(null);
  const [authState, setAuthState] = useState<StoredAuthState | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const chatsQuery = useChatsOverviewQuery({ initialChats });
  const sheetStatusQuery = useSheetDataStatus(Boolean(authState?.user?.id));
  const createChatMutation = useCreateChatMutation();
  const deleteChatMutation = useDeleteChatMutation();
  const renameChatMutation = useRenameChatByIdMutation();
  const uploadDataSourceMutation = useUploadDataSourceMutation();
  const activeChatId = getActiveChatId(params);
  const isSuggestionPage = pathname === '/share-suggestion';
  const apiHostLabel = API_BASE_URL.replace(/^https?:\/\//, '');
  const chats = chatsQuery.data?.chats ?? initialChats;
  const hasSheetData = Boolean(sheetStatusQuery.data?.hasSheetData);
  const isCheckingSheetData =
    Boolean(authState?.user?.id) &&
    !sheetStatusQuery.data &&
    sheetStatusQuery.isLoading;

  useEffect(() => {
    function handleChatRenamed(event: Event) {
      const detail = (event as CustomEvent<ChatRenamedEventDetail>).detail;

      if (!detail?.chatId || !detail.company) {
        return;
      }

      queryClient.setQueryData<ChatsOverviewData>(
        apiQueryKeys.chatsOverview,
        (current) => ({
          chats: (current?.chats ?? initialChats).map((chat) =>
            chat._id === detail.chatId
              ? { ...chat, company: detail.company }
              : chat,
          ),
          latestChatId: current?.latestChatId ?? initialChats[0]?._id ?? null,
        }),
      );
    }

    window.addEventListener(CHAT_RENAMED_EVENT, handleChatRenamed);
    return () =>
      window.removeEventListener(CHAT_RENAMED_EVENT, handleChatRenamed);
  }, [initialChats, queryClient]);

  useEffect(() => {
    function syncAuthState() {
      setAuthState(getStoredAuth());
      setIsAuthLoading(false);
    }

    function handleStorage(event: StorageEvent) {
      if (event.key && !event.key.startsWith('maifast.auth.')) {
        return;
      }

      syncAuthState();
    }

    syncAuthState();
    window.addEventListener('storage', handleStorage);
    window.addEventListener(AUTH_STATE_CHANGED_EVENT, syncAuthState);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(AUTH_STATE_CHANGED_EVENT, syncAuthState);
    };
  }, []);

  useEffect(() => {
    const error = sheetStatusQuery.error;

    if (!error) {
      return;
    }

    if (error instanceof ApiClientError && error.status === 401) {
      clearStoredAuth();
      setAuthState(null);
      router.push('/login');
      return;
    }

    logger.warn('Sheet data status check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }, [router, sheetStatusQuery.error]);

  function closeSidebarOnMobile() {
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  }

  function redirectToLoginIfUnauthorized(error: unknown) {
    if (error instanceof ApiClientError && error.status === 401) {
      clearStoredAuth();
      setAuthState(null);
      router.push('/login');
      return true;
    }

    return false;
  }

  function logHandledApiFailure(message: string, error: ApiClientError) {
    logger.warn(message, {
      status: error.status,
      error: error.message,
    });
  }

  function handleOpenSignIn() {
    router.push('/login');
  }

  function handleOpenChat(chatId: string) {
    router.push(`/c/${chatId}`);
    closeSidebarOnMobile();
  }

  function handleOpenSheetEditor() {
    if (
      !ensureSheetDataAvailable('Upload a file before opening the sheet editor.')
    ) {
      return;
    }

    router.push('/edit/sheet');
    closeSidebarOnMobile();
  }

  function handleOpenSuggestionPage() {
    router.push('/share-suggestion');
    closeSidebarOnMobile();
  }

  function handleDownloadSample() {
    toast.info('Dummy CSV download started.', {
      description: 'Use the sample file to test upload and chat flows.',
    });
  }

  function ensureSheetDataAvailable(description: string) {
    if (!authState?.user?.id) {
      toast.error('Sign in required', {
        description: 'Please sign in before using chat or sheet tools.',
      });
      return false;
    }

    if (!sheetStatusQuery.data && (sheetStatusQuery.isLoading || sheetStatusQuery.isFetching)) {
      toast.info('Checking sheet data...', {
        description: 'Please wait while we confirm your uploaded data.',
      });
      return false;
    }

    if (!hasSheetData) {
      toast.error('Upload sheet data first', {
        description,
      });
      return false;
    }

    return true;
  }

  async function handleCreateChat() {
    try {
      const chat = await createChatMutation.mutateAsync();
      router.push(`/c/${chat._id}`);
      closeSidebarOnMobile();
    } catch (error) {
      if (redirectToLoginIfUnauthorized(error)) {
        return;
      }

      if (error instanceof ApiClientError) {
        logHandledApiFailure('New chat creation failed', error);
        return;
      }

      logger.error('New chat creation failed', error);
    }
  }

  async function handleRenameChat(chatId: string) {
    const currentChat = chats.find((chat) => chat._id === chatId);
    const currentName = currentChat?.company ?? '';
    setRenameChatId(chatId);
    setRenameChatName(currentName);
  }

  async function handleRenameConfirm() {
    if (!renameChatId) {
      return;
    }

    const currentChat = chats.find((chat) => chat._id === renameChatId);
    const currentName = currentChat?.company ?? '';
    const normalizedName = renameChatName.trim();

    if (!normalizedName || normalizedName === currentName) {
      setRenameChatId(null);
      setRenameChatName('');
      return;
    }

    try {
      await renameChatMutation.mutateAsync({
        chatId: renameChatId,
        company: normalizedName,
      });
      window.dispatchEvent(
        new CustomEvent(CHAT_RENAMED_EVENT, {
          detail: {
            chatId: renameChatId,
            company: normalizedName,
          },
        }),
      );
      setRenameChatId(null);
      setRenameChatName('');
    } catch (error) {
      if (redirectToLoginIfUnauthorized(error)) {
        return;
      }

      if (error instanceof ApiClientError) {
        logHandledApiFailure('Rename failed', error);
        return;
      }

      logger.error('Rename failed', error);
    }
  }

  function handleRenameCancel() {
    setRenameChatId(null);
    setRenameChatName('');
  }

  function handleRenameDialogOpenChange(open: boolean) {
    if (!open) {
      handleRenameCancel();
    }
  }

  async function handleSignOut() {
    setIsSigningOut(true);

    try {
      await signOut();
      setAuthState(null);
      router.push('/login');
      router.refresh();
    } finally {
      setIsSigningOut(false);
    }
  }

  function handleDeleteChat(chatId: string) {
    setDeleteChatId(chatId);
  }

  async function handleDeleteConfirm() {
    if (!deleteChatId) {
      return;
    }

    try {
      await deleteChatMutation.mutateAsync(deleteChatId);
      setDeleteChatId(null);
    } catch (error) {
      if (redirectToLoginIfUnauthorized(error)) {
        return;
      }

      if (error instanceof ApiClientError) {
        logHandledApiFailure('Delete failed', error);
        return;
      }

      logger.error('Delete failed', error);
      return;
    }

    if (activeChatId === deleteChatId) {
      router.push('/');
      return;
    }

    router.refresh();
  }

  function handleDeleteCancel() {
    setDeleteChatId(null);
  }

  function handleDeleteDialogOpenChange(open: boolean) {
    if (!open) {
      handleDeleteCancel();
    }
  }

  const renameChat = chats.find((chat) => chat._id === renameChatId);
  const deleteChat = chats.find((chat) => chat._id === deleteChatId);

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    event.preventDefault();
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!authState?.user?.id) {
      toast.error('Upload failed', {
        description: 'User ID is missing. Please sign in again.',
      });
      event.target.value = '';
      return;
    }

    const uploadToastId = toast.loading('Uploading file...', {
      description: `${file.name} is being analyzed and attached.`,
    });
    setUploadStep('analyzing');
    setProgressMessage('AI is analyzing format...');

    try {
      await uploadDataSourceMutation.mutateAsync({
        file,
        userId: authState.user.id,
        onCleaned: () => {
          setUploadStep('processing');
          setProgressMessage('Data cleaned successfully. Finalizing upload...');
        },
      });

      const successMessage = `${file.name} was cleaned successfully.`;

      toast.success('Upload complete', {
        id: uploadToastId,
        description: successMessage,
      });
      setUploadStep('success');
      setProgressMessage(successMessage);

      window.setTimeout(() => setUploadStep('idle'), 3000);
      router.refresh();
      window.dispatchEvent(new Event(DATA_SOURCE_UPLOADED_EVENT));
    } catch (error) {
      if (redirectToLoginIfUnauthorized(error)) {
        return;
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Data conversion failed.';

      logger.error('Data conversion error', error, {
        fileName: file.name,
        chatId: activeChatId,
      });

      setUploadStep('error');
      setProgressMessage(errorMessage);
      toast.error('Upload failed', {
        id: uploadToastId,
        description: errorMessage,
      });
      window.setTimeout(() => setUploadStep('idle'), 5000);
    } finally {
      event.target.value = '';
    }
  }

  return (
    <div className='flex h-screen w-full overflow-hidden bg-transparent font-sans text-slate-900 selection:bg-blue-500/30 dark:text-gray-100'>
      <Dialog
        open={Boolean(renameChatId)}
        onOpenChange={handleRenameDialogOpenChange}
      >
        <DialogContent className='font-sans'>
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
            <DialogDescription>
              Update the chat title to make it easier to identify later.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleRenameConfirm();
            }}
          >
            <div className='px-6 pb-2'>
              <Label htmlFor='rename-chat-title' className='mb-1 block text-sm'>
                Chat title
              </Label>
              <Input
                id='rename-chat-title'
                value={renameChatName}
                onChange={(event) => setRenameChatName(event.target.value)}
                placeholder='Enter chat title'
              />
            </div>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={handleRenameCancel}
                disabled={renameChatMutation.isPending}
                className='rounded-xl'
              >
                Cancel
              </Button>
              <Button
                type='submit'
                disabled={
                  renameChatMutation.isPending ||
                  !renameChatName.trim() ||
                  renameChat?.company === renameChatName.trim()
                }
                className='rounded-xl'
              >
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteChatId)} onOpenChange={handleDeleteDialogOpenChange}>
        <DialogContent className='font-sans'>
          <DialogHeader>
            <DialogTitle>Delete chat</DialogTitle>
            <DialogDescription>
              {`This action can't be undone. You are about to delete ${
                deleteChat?.company || 'this chat'
              } and all its messages.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={handleDeleteCancel}
              disabled={deleteChatMutation.isPending}
              className='rounded-xl'
            >
              Cancel
            </Button>
            <Button
              type='button'
              variant='destructive'
              onClick={handleDeleteConfirm}
              disabled={deleteChatMutation.isPending}
              className='rounded-xl'
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SidebarToggleButton
        isSidebarOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen((open) => !open)}
        className='fixed left-4 top-4 z-[60] rounded-lg border border-slate-200 bg-white/85 p-2 text-slate-500 backdrop-blur-md hover:text-slate-900 dark:border-white/10 dark:bg-white/10 dark:text-gray-400 dark:hover:text-white md:hidden'
      />

      <MainLayoutSidebar
        isSidebarOpen={isSidebarOpen}
        isCreatingChat={createChatMutation.isPending}
        chats={chats}
        activeChatId={activeChatId}
        uploadStep={uploadStep}
        progressMessage={progressMessage}
        hasSheetData={hasSheetData}
        isCheckingSheetData={isCheckingSheetData}
        authState={authState}
        isAuthLoading={isAuthLoading}
        isSigningOut={isSigningOut}
        apiHostLabel={apiHostLabel}
        onCloseSidebar={() => setIsSidebarOpen(false)}
        onCreateChat={handleCreateChat}
        onOpenChat={handleOpenChat}
        onDeleteChat={handleDeleteChat}
        onRenameChat={handleRenameChat}
        onUploadFile={handleFileUpload}
        onDownloadSample={handleDownloadSample}
        onOpenSheetEditor={handleOpenSheetEditor}
        onOpenSuggestionPage={handleOpenSuggestionPage}
        isSuggestionPage={isSuggestionPage}
        onOpenSignIn={handleOpenSignIn}
        onSignOut={handleSignOut}
      />

      <div className='relative flex h-full w-full flex-1 flex-col overflow-hidden'>
        {!isSidebarOpen && (
          <SidebarToggleButton
            isSidebarOpen={false}
            onToggle={() => setIsSidebarOpen(true)}
            className='absolute left-4 top-4 z-50 rounded-lg border border-slate-200 bg-white/85 p-2 text-slate-500 backdrop-blur-md transition-colors hover:text-slate-900 dark:border-white/10 dark:bg-white/10 dark:text-gray-400 dark:hover:text-white'
          />
        )}
        {children}
      </div>
    </div>
  );
}
