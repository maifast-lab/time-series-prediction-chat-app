import { redirect } from 'next/navigation';

import { PageBody } from '@/components/app/AppPage';
import MainLayout from '@/components/main-layout/MainLayout';
import SheetEditorClient from '@/components/sheet-editor/SheetEditorClient';
import type { ChatsOverviewData } from '@/lib/chat-types';
import { ServerApiError, requestServerApi } from '@/lib/server/api-client';
import { requireServerAuthState } from '@/lib/server/auth';

export default async function EditSheetPage() {
  await requireServerAuthState();
  let chats: ChatsOverviewData['chats'];

  try {
    ({ chats } = await requestServerApi<ChatsOverviewData>('/api/chats'));
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 401) {
      redirect('/login');
    }
    throw error;
  }
  return (
    <MainLayout initialChats={chats}>
      <PageBody>
        <SheetEditorClient />
      </PageBody>
    </MainLayout>
  );
}
