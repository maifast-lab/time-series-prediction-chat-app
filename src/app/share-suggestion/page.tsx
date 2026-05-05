import { redirect } from 'next/navigation';

import MainLayout from '@/components/main-layout/MainLayout';
import SuggestionPageClient from '@/components/suggestion-page/SuggestionPageClient';
import type { ChatsOverviewData } from '@/lib/chat-types';
import { ServerApiError, requestServerApi } from '@/lib/server/api-client';
import { requireServerAuthState } from '@/lib/server/auth';

async function loadShareSuggestionPageData() {
  await requireServerAuthState();

  try {
    return await requestServerApi<ChatsOverviewData>('/api/chats');
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 401) {
      redirect('/login');
    }

    throw error;
  }
}

export default async function ShareSuggestionPage() {
  const chatsOverview = await loadShareSuggestionPageData();

  return (
    <MainLayout initialChats={chatsOverview.chats}>
      <SuggestionPageClient />
    </MainLayout>
  );
}
