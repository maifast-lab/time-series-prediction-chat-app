import { notFound, redirect } from 'next/navigation';
import ChatPageClient from '@/components/chat-page/ChatPageClient';
import MainLayout from '@/components/main-layout/MainLayout';
import type { ChatPageData, ChatsOverviewData } from '@/lib/chat-types';
import { ServerApiError, requestServerApi } from '@/lib/server/api-client';
import { requireServerAuthState } from '@/lib/server/auth';

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

async function loadChatPageData(id: string) {
  await requireServerAuthState();
  try {
    return await Promise.all([
      requestServerApi<ChatPageData>(`/api/chats/${id}`),
      requestServerApi<ChatsOverviewData>('/api/chats'),
    ]);
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 401) {
      redirect('/login');
    }

    if (error instanceof ServerApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }
}
export default async function ChatPage({ params }: ChatPageProps) {
  const { id } = await params;
  const [chatPageData, chatsResponse] = await loadChatPageData(id);
  return (
    <MainLayout initialChats={chatsResponse.chats}>
      <ChatPageClient
        initialChat={chatPageData.chat}
        initialMessages={chatPageData.messages}
        initialHasUploadedData={chatPageData.hasUploadedData}
        initialActiveDataSourceName={chatPageData.activeDataSourceName}
      />
    </MainLayout>
  );
}
