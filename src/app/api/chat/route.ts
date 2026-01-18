import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Chat from '@/models/Chat';

export async function POST(req: Request) {
  try {
    await dbConnect();
    const body = await req.json();
    const { company, place, minBound, maxBound } = body;

    if (!company || !place) {
      return NextResponse.json(
        { error: 'Company and Place are required' },
        { status: 400 }
      );
    }

    const chat = await Chat.create({
      company,
      place,
      minBound: minBound ? Number(minBound) : undefined,
      maxBound: maxBound ? Number(maxBound) : undefined,
      // frequencyDays left undefined until first upload
    });

    return NextResponse.json(chat, { status: 201 });
  } catch (error) {
    console.error('Create Chat Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    await dbConnect();
    // List chats (exclude soft deleted)
    const chats = await Chat.find({ isDeleted: { $ne: true } }).sort({
      createdAt: -1,
    });
    return NextResponse.json(chats);
  } catch (error) {
    console.error('List Chats Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
