import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Chat from '@/models/Chat';
import DataSource from '@/models/DataSource';
import VectorData from '@/models/VectorData';
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

    const hasData = await DataSource.exists({ userId: session.user.dbId });

    return NextResponse.json({
      chat,
      hasGlobalData: !!hasData,
    });
  } catch (error) {
    logger.error('Get Chat Error', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
