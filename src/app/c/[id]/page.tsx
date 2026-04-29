import { notFound, redirect } from 'next/navigation';

import ChatPageClient from '@/components/ChatPageClient';
import MainLayout from '@/components/MainLayout';
import { getChatPageDataForCurrentUser, getChatsForCurrentUser } from '@/lib/server/chat';
import { NotFoundError, UnauthorizedError } from '@/lib/server/errors';

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

async function loadChatPageData(id: string) {
  try {
    return await Promise.all([
      getChatPageDataForCurrentUser(id),
      getChatsForCurrentUser(),
    ]);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect('/login');
    }

    if (error instanceof NotFoundError) {
      notFound();
    }

    throw error;
  }
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { id } = await params;
  const [chatPageData, chats] = await loadChatPageData(id);

  return (
    <MainLayout initialChats={chats}>
      <ChatPageClient
        initialChat={chatPageData.chat}
        initialMessages={chatPageData.messages}
        initialHasUploadedData={chatPageData.hasUploadedData}
        initialActiveDataSourceName={chatPageData.activeDataSourceName}
      />
    </MainLayout>
  );
}
