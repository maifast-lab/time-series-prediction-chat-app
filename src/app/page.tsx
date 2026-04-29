import { Sparkles, FileSpreadsheet, ShieldCheck } from 'lucide-react';
import { redirect } from 'next/navigation';

import { AppLogo } from '@/components/AppLogo';
import { AppPanel, PageBody, PageContainer, SectionTag } from '@/components/AppPage';
import CreateChatButton from '@/components/CreateChatButton';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import MainLayout from '@/components/MainLayout';
import type { ChatsOverviewData } from '@/lib/chat-types';
import { ServerApiError, requestServerApi } from '@/lib/server/api-client';
import { requireServerAuthState } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

const highlights = [
  {
    title: 'Focused chat threads',
    description: 'Keep each dataset and analysis flow inside its own clean conversation.',
    icon: Sparkles,
  },
  {
    title: 'Spreadsheet-ready',
    description: 'Upload CSV or Excel files from the sidebar and ask questions against them.',
    icon: FileSpreadsheet,
  },
  {
    title: 'Secure access',
    description: 'Google sign-in tokens stay aligned across the browser and server routes.',
    icon: ShieldCheck,
  },
];

async function loadHomeChatsOverview() {
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

export default async function Home() {
  const chatsData = await loadHomeChatsOverview();
  const { chats, latestChatId } = chatsData;

  if (latestChatId) {
    redirect(`/c/${latestChatId}`);
  }

  return (
    <MainLayout initialChats={chats}>
      <PageBody>
        <PageContainer className='max-w-5xl'>
          <AppPanel className='rounded-[34px] text-center'>
            <CardHeader className='items-center px-6 pt-8 text-center sm:px-10 sm:pt-10'>
              <AppLogo size='lg' />
              <SectionTag className='mt-5'>AI spreadsheet assistant</SectionTag>
              <CardTitle className='mt-4 text-4xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-5xl'>
                Turn uploaded sheets into guided conversations.
              </CardTitle>
              <CardDescription className='max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300'>
                Maifast gives you a consistent workspace for uploading data,
                asking natural-language questions, and keeping every answer tied
                to the right chat.
              </CardDescription>
            </CardHeader>

            <CardContent className='px-6 pb-8 sm:px-10 sm:pb-10'>
              <div className='flex justify-center'>
                <CreateChatButton
                  size='lg'
                  className='rounded-2xl px-6 shadow-lg shadow-blue-950/15'
                >
                  Start your first conversation
                </CreateChatButton>
              </div>

              <div className='mt-8 grid gap-3 text-left md:grid-cols-3'>
                {highlights.map(({ title, description, icon: Icon }) => (
                  <div
                    key={title}
                    className='rounded-[24px] border border-slate-200/80 bg-slate-50/85 p-5 dark:border-white/10 dark:bg-white/5'
                  >
                    <div className='flex size-11 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-200'>
                      <Icon className='size-5' />
                    </div>
                    <h2 className='mt-4 text-base font-semibold text-slate-950 dark:text-white'>
                      {title}
                    </h2>
                    <p className='mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400'>
                      {description}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </AppPanel>
        </PageContainer>
      </PageBody>
    </MainLayout>
  );
}
