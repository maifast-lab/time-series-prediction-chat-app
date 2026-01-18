import { redirect } from 'next/navigation';
import dbConnect from '@/lib/db';
import Chat from '@/models/Chat';

export default async function Home() {
  await dbConnect();
  // If chats exist, redirect to the latest one?
  const latest = await Chat.findOne().sort({ createdAt: -1 });

  if (latest) {
    redirect(`/c/${latest._id}`);
  } else {
    redirect('/new');
  }
}
