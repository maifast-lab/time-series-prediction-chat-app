import MainLayoutClient from '@/components/main-layout/MainLayoutClient';
import type { ChatSummary } from '@/lib/chat-types';

interface MainLayoutProps {
  children: React.ReactNode;
  initialChats: ChatSummary[];
}

export default function MainLayout({
  children,
  initialChats,
}: MainLayoutProps) {
  return (
    <MainLayoutClient initialChats={initialChats}>
      {children}
    </MainLayoutClient>
  );
}
