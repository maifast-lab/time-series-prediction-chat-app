import MainLayout from '@/components/MainLayout';
import { getChatsForCurrentUser } from '@/lib/server/chat';

export default async function EditSheetPage() {
  const chats = await getChatsForCurrentUser();

  return (
    <MainLayout initialChats={chats}>
      <div className='flex-1 flex items-center justify-center p-6'>
        <div className='w-full max-w-2xl rounded-3xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-white/5 p-8 text-center shadow-xl shadow-slate-200/60 dark:shadow-none'>
          <div className='text-sm font-semibold text-blue-600 dark:text-blue-400'>
            /edit/sheet
          </div>
          <h1 className='mt-3 text-3xl font-bold text-slate-900 dark:text-white'>
            Edit Sheet
          </h1>
          <p className='mt-4 text-sm text-slate-600 dark:text-slate-400 leading-relaxed'>
            This page is ready as the sheet editing entry point. The sidebar now
            routes here from the new Sheet Actions menu.
          </p>
        </div>
      </div>
    </MainLayout>
  );
}
