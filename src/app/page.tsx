import { redirect } from 'next/navigation';
import { AppPanel, PageBody, PageContainer } from '@/components/app/AppPage';
import MainLayout from '@/components/main-layout/MainLayout';
import type { ChatsOverviewData, LatestChatLookupResponse } from '@/lib/chat-types';
import { ServerApiError, requestServerApi } from '@/lib/server/api-client';
import { requireServerAuthState } from '@/lib/server/auth';
import Image from 'next/image';
const logoImg = "/PNG.png";
export const dynamic = 'force-dynamic';
async function loadHomeChatsOverview() {
  await requireServerAuthState();

  try {
    const latestChat = await requestServerApi<LatestChatLookupResponse>(
      '/api/chats/latest',
    );

    if (latestChat.hasChat && latestChat.chatId) {
      redirect(`/c/${latestChat.chatId}`);
    }

    return await requestServerApi<ChatsOverviewData>('/api/chats');
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 401) {
      redirect('/login');
    }

    throw error;
  }
}

export default async function Home() {
  const chatsData = await loadHomeChatsOverview();
  const { chats, latestChatId } = chatsData;

  if (latestChatId) {
    redirect(`/c/${latestChatId}`);
  }

  return (
    <MainLayout initialChats={chats}>
      <PageBody className='grid min-h-[calc(100dvh-8rem)] place-items-center'>
        <PageContainer className='items-center'>
          <AppPanel className='w-full max-w-3xl overflow-hidden rounded-[34px]'>
            <div className='relative px-6 py-12 text-center sm:px-10'>

              <div className='relative'>
                <Image
                  src={logoImg}
                  alt='Maifast logo'
                  width={200}
                  height={200}
                  className='mx-auto'
                />
                <h1 className='mt-6 text-4xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-5xl'>
                  Welcome to Maifast
                </h1>
                <p className='mx-auto mt-4 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300'>
                  Manage conversations, automate tasks, and get instant AI-powered
                  insights from one professional workspace.
                </p>
               
              </div>
            </div>
          </AppPanel>
        </PageContainer>
      </PageBody>
    </MainLayout>
  );
}
