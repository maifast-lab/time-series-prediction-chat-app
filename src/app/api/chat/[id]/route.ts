import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Chat from '@/models/Chat';
import { resolveChatDataSource } from '@/lib/chat-data-source';
import { logger } from '@/lib/logger';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.dbId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const { id } = await params;

    const chat = await Chat.findOne({ _id: id, userId: session.user.dbId });

    if (!chat || chat.isDeleted) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    const activeDataSource = await resolveChatDataSource({
      userId: session.user.dbId,
      chatId: String(chat._id),
      dataSourceId: chat.dataSourceId?.toString(),
    });

    return NextResponse.json({
      chat,
      hasGlobalData: !!activeDataSource,
      activeDataSourceName: activeDataSource?.name || null,
    });
  } catch (error) {
    logger.error('Get Chat Error', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
