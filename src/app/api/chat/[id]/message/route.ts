import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Chat from '@/models/Chat';
import Message from '@/models/Message';
import DataSource from '@/models/DataSource';
import { getMaifastModel } from '@/lib/gemini';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { performVectorSearch } from '@/lib/vector-search';
import { logger } from '@/lib/logger';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(
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
    const { text: userText } = await req.json();

    if (!userText)
      return NextResponse.json(
        { error: 'Message text required' },
        { status: 400 },
      );

    const chat = await Chat.findOne({ _id: id, userId: session.user.dbId });
    if (!chat)
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });

    await Message.create({
      chatId: chat._id,
      role: 'user',
      content: userText,
    });

    const dataSources = await DataSource.find({
      userId: session.user.dbId,
    }).select('name schemaSummary');
    const schemaMap = dataSources
      .map(
        (s) => `Dataset "${s.name}": ${s.schemaSummary || 'Tabular raw data'}`,
      )
      .join('\n');

    let contextString = '';
    try {
      const contextResults = await performVectorSearch(
        userText,
        session.user.dbId,
        20,
      );
      contextString = contextResults
        .map((r: { content: string }) => `- ${r.content}`)
        .join('\n');
    } catch (vErr) {
      logger.error('Vector Search failed, using Schema Map only', vErr);
    }

    logger.info('RAG CONTEXT RETRIEVED', { context: contextString || 'None' });

    const model = getMaifastModel();

    const prompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `
        You are Maifast, a premium AI assistant. The user is in a chat.
        The current date and time is {currentDate}.
        
        GOAL:
        1. Provide intelligent, helpful, and concise answers to user queries.
        2. Use the provided context from any uploaded files to ground your responses accurately.
        3. Use the schema map information below if relevant.
        4. If no specific data is provided in context, answer based on your general knowledge.
        5. Maintain a professional yet friendly and modern tone.
        
        SCHEMA MAP:
        {schemaMap}

        CONTEXT FROM FILES:
        {context}
      `,
      ],
      ['human', '{input}'],
    ]);

    const chain = prompt.pipe(model).pipe(new StringOutputParser());

    const aiText = await chain.invoke({
      company: chat.company,
      place: chat.place,
      currentDate: new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Kolkata',
      }),
      schemaMap,
      context:
        contextString || 'No specific data found in the Excel for this query.',
      input: userText,
    });

    const finalResponse = aiText;
    const type = 'text';
    const metadata = {};

    const assistantMsg = await Message.create({
      chatId: chat._id,
      role: 'assistant',
      content: finalResponse,
      type,
      metadata,
    });

    // Generate automatic title if it's currently "New Chat"
    if (chat.company === 'New Chat') {
      try {
        const titlePrompt = ChatPromptTemplate.fromMessages([
          [
            'system',
            'Generate a extremely concise (max 3-4 words) title for a conversation starting with this message. Return ONLY the title text.',
          ],
          ['human', userText],
        ]);
        const titleChain = titlePrompt
          .pipe(model)
          .pipe(new StringOutputParser());
        const generatedTitle = await titleChain.invoke({ input: userText });

        if (generatedTitle && generatedTitle.length < 50) {
          await Chat.findByIdAndUpdate(chat._id, {
            company: generatedTitle.trim(),
          });
        }
      } catch (tErr) {
        logger.error('Failed to generate automatic title', tErr);
      }
    }

    return NextResponse.json(assistantMsg);
  } catch (error: unknown) {
    logger.error('Message Error', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
