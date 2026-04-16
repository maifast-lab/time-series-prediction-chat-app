import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Chat from '@/models/Chat';
import { logger } from '@/lib/logger';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    if (!session?.user?.dbId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { company?: string; place?: string } = {};
    try {
      body = await req.json();
    } catch {
      logger.warn('Failed to parse request body');
    }

    const { company, place } = body;

    const chat = await Chat.create({
      userId: session.user.dbId,
      company: company || 'New Chat',
      place: place || 'General',
    });

    return NextResponse.json(chat, { status: 201 });
  } catch (error) {
    logger.error('Create Chat Error', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.dbId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const chats = await Chat.find({
      userId: session.user.dbId,
      isDeleted: { $ne: true },
    }).sort({
      createdAt: -1,
    });
    return NextResponse.json(chats);
  } catch (error) {
    logger.error('List Chats Error', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
