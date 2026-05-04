import { FileSpreadsheet, Upload } from 'lucide-react';
import { redirect } from 'next/navigation';

import { AppPanel, PageBody, PageContainer, SectionTag } from '@/components/AppPage';
import CreateChatButton from '@/components/CreateChatButton';
import MainLayout from '@/components/MainLayout';
import { Button } from '@/components/ui/button';
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
        <PageContainer className='max-w-5xl'>
          <AppPanel className='rounded-[34px]'>
            <div className='px-6 py-8 sm:px-8'>
              <SectionTag>Sheet workspace</SectionTag>
              <div className='mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between'>
                <div className='max-w-2xl'>
                  <h1 className='text-4xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-5xl'>
                    Prepare the spreadsheet tools.
                  </h1>
                  <p className='mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base'>
                    This route is set up as the editor entry point. The sidebar
                    now uses the same shadcn action styles everywhere, and this
                    page is ready for the next round of sheet-specific features.
                  </p>
                </div>

                <div className='flex flex-col gap-3 sm:flex-row'>
                  <Button asChild size='lg' variant='outline' className='rounded-xl'>
                    <a href='/dummy.csv' download='dummy.csv'>
                      <Upload className='size-4' />
                      Download sample CSV
                    </a>
                  </Button>
                  <CreateChatButton size='lg' className='rounded-xl px-5'>
                    Start chat with new sheet
                  </CreateChatButton>
                </div>
              </div>
            </div>
          </AppPanel>

          <div className='grid gap-4 md:grid-cols-3'>
            {[
              'Upload and preview worksheet structure.',
              'Map sheet context into a conversation thread.',
              'Return to chat with the active dataset preserved.',
            ].map((item, index) => (
              <AppPanel
                key={item}
                className='rounded-[24px] border border-slate-200/80 bg-white/78 shadow-none dark:border-white/10 dark:bg-slate-950/55'
              >
                <div className='px-5 py-5'>
                  <div className='flex size-11 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-200'>
                    <FileSpreadsheet className='size-5' />
                  </div>
                  <p className='mt-4 text-sm font-semibold text-slate-950 dark:text-white'>
                    Step {index + 1}
                  </p>
                  <p className='mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400'>
                    {item}
                  </p>
                </div>
              </AppPanel>
            ))}
          </div>
        </PageContainer>
      </PageBody>
    </MainLayout>
  );
}
