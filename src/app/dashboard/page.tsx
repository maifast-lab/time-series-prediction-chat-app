import { redirect } from 'next/navigation';
import {
  ArrowRight,
  FileSpreadsheet,
  MessageSquareMore,
  ShieldCheck,
} from 'lucide-react';

import { AppPanel, PageBody, PageContainer, SectionTag } from '@/components/app/AppPage';
import CreateChatButton from '@/components/app/CreateChatButton';
import GuardedChatLink from '@/components/app/GuardedChatLink';
import GuardedSheetEditorLink from '@/components/app/GuardedSheetEditorLink';
import LogoutButton from '@/components/app/LogoutButton';
import MainLayout from '@/components/main-layout/MainLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ChatsOverviewData } from '@/lib/chat-types';
import { ServerApiError, requestServerApi } from '@/lib/server/api-client';
import { requireServerAuthState } from '@/lib/server/auth';

async function loadDashboardData() {
  const authState = await requireServerAuthState();

  try {
    const chatsOverview = await requestServerApi<ChatsOverviewData>('/api/chats');
    return {
      authState,
      chatsOverview,
    };
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 401) {
      redirect('/login');
    }

    throw error;
  }
}

export default async function DashboardPage() {
  const { authState, chatsOverview } = await loadDashboardData();
  const latestChatId = chatsOverview.latestChatId;

  return (
    <MainLayout initialChats={chatsOverview.chats}>
      <PageBody>
        <PageContainer>
          <AppPanel className='rounded-[34px]'>
            <div className='flex flex-col gap-8 px-6 py-8 sm:px-8 lg:flex-row lg:items-end lg:justify-between'>
              <div className='max-w-2xl'>
                <SectionTag className='inline-flex'>
                  Workspace overview
                </SectionTag>
                <h1 className='mt-5 text-4xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-5xl'>
                  Welcome back{authState.user?.name ? `, ${authState.user.name}` : ''}.
                </h1>
                <p className='mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base'>
                  Resume recent conversations, upload spreadsheets, and keep
                  your data questions organized in one workspace.
                </p>
              </div>

              <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
                <CreateChatButton
                  size='lg'
                  className='rounded-xl px-5 shadow-lg shadow-blue-950/15'
                >
                  Start new conversation
                </CreateChatButton>
                <LogoutButton size='lg' className='rounded-xl' />
              </div>
            </div>
          </AppPanel>

          <section className='grid gap-5 lg:grid-cols-[1.15fr_0.85fr]'>
            <AppPanel className='rounded-[28px]'>
              <div className='px-6 py-6'>
                <div className='flex items-center gap-3'>
                  <div className='flex size-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-200'>
                    <MessageSquareMore className='size-5' />
                  </div>
                  <div>
                    <h2 className='text-lg font-semibold text-slate-950 dark:text-white'>
                      Conversations
                    </h2>
                    <p className='text-sm text-slate-500 dark:text-slate-400'>
                      Resume a recent thread or start fresh.
                    </p>
                  </div>
                </div>

                <div className='mt-6 rounded-[24px] border border-slate-200/80 bg-slate-50/85 p-5 dark:border-white/10 dark:bg-white/5'>
                  <div className='flex flex-wrap items-center justify-between gap-3'>
                    <div>
                      <p className='text-sm font-medium text-slate-500 dark:text-slate-400'>
                        Total chats
                      </p>
                      <p className='mt-1 text-3xl font-semibold text-slate-950 dark:text-white'>
                        {chatsOverview.chats.length}
                      </p>
                    </div>

                    {latestChatId ? (
                      <Button asChild variant='outline' className='rounded-full'>
                        <GuardedChatLink chatId={latestChatId}>
                          Open latest
                          <ArrowRight className='size-4' />
                        </GuardedChatLink>
                      </Button>
                    ) : (
                      <Badge
                        variant='outline'
                        className='rounded-full border-dashed text-slate-500 dark:text-slate-400'
                      >
                        No chats yet
                      </Badge>
                    )}
                  </div>

                  <div className='mt-5 space-y-3'>
                    {chatsOverview.chats.slice(0, 4).map((chat) => (
                      <GuardedChatLink
                        key={chat._id}
                        chatId={chat._id}
                        className='flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/90 px-4 py-3 text-sm text-slate-700 transition hover:border-blue-400 hover:bg-blue-50/80 hover:text-slate-950 dark:border-white/10 dark:bg-slate-950/70 dark:text-slate-200 dark:hover:border-blue-400 dark:hover:bg-blue-400/10 dark:hover:text-white'
                      >
                        <div className='min-w-0'>
                          <div className='truncate font-semibold'>
                            {chat.company || 'New chat'}
                          </div>
                          <div className='truncate text-xs text-slate-500 dark:text-slate-400'>
                            {chat.place || 'Workspace'}
                          </div>
                        </div>
                        <ArrowRight className='size-4 flex-shrink-0' />
                      </GuardedChatLink>
                    ))}
                  </div>
                </div>
              </div>
            </AppPanel>

            <AppPanel className='rounded-[28px]'>
              <div className='px-6 py-6'>
                <div className='flex items-center gap-3'>
                  <div className='flex size-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-200'>
                    <FileSpreadsheet className='size-5' />
                  </div>
                  <div>
                    <h2 className='text-lg font-semibold text-slate-950 dark:text-white'>
                      Data workspace
                    </h2>
                    <p className='text-sm text-slate-500 dark:text-slate-400'>
                      Upload sheets, open the editor, and keep each dataset mapped
                      to the right conversation.
                    </p>
                  </div>
                </div>

                <div className='mt-6 space-y-4'>
                  <Button asChild variant='secondary' className='w-full rounded-2xl'>
                    <GuardedSheetEditorLink>
                      Open sheet editor
                      <ArrowRight className='size-4' />
                    </GuardedSheetEditorLink>
                  </Button>

                  <div className='rounded-[24px] border border-dashed border-slate-300 p-5 text-sm leading-7 text-slate-600 dark:border-white/10 dark:text-slate-300'>
                    Use the sidebar or sheet editor to upload CSV and Excel
                    files, then ask questions from the matching conversation.
                  </div>

                  <div className='inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200'>
                    <ShieldCheck className='size-3.5' />
                    Workspace ready
                  </div>
                </div>
              </div>
            </AppPanel>
          </section>
        </PageContainer>
      </PageBody>
    </MainLayout>
  );
}
