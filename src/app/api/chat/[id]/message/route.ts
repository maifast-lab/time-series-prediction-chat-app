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
        10000,
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
        You are Maifast, a premium AI assistant specialized in time-series data analysis, forecasting, and business intelligence.
        The current date and time is {currentDate}.
        
        GOAL:
        1. Try to provide accurate, data-driven answers based on the uploaded time-series data.
        2. When answering questions about data, reference specific values and dates from the context.
        3. For predictions/forecasts, analyze the historical patterns and extrapolate to estimate future values.
        4. Be precise with numbers - use the actual values from the context.
        5. Maintain a professional yet friendly tone.
        
        CRITICAL RULES FOR TIME-SERIES DATA:
        - Tags like FB, GB, GL, DS are CATEGORY CODES from the data - NOT company names like Facebook or Google.
        - Data is in format: [TAG: XX] Time-series from YYYY-MM to YYYY-MM. Values: YYYY-MM: value | YYYY-MM: value
        - When user asks for a "prediction" WITHOUT specifying a date, predict for TODAY's date ({currentDate}).
        - For forecasting: Look at the trend/pattern in historical values and extrapolate forward.
        - If asked about a specific tag (e.g., "predict FB"), use ALL historical values for that tag.
        
        FORECASTING APPROACH:
        1. Identify the trend (increasing, decreasing, stable, seasonal)
        2. Calculate recent average and rate of change
        3. Apply the pattern to estimate the requested future date
        4. Provide confidence level based on data consistency
        
        AVAILABLE DATA SOURCES:
        {schemaMap}

        TIME-SERIES DATA CONTEXT:
        {context}
        
        INSTRUCTIONS:
        - Each [TAG: XX] entry contains the complete time-series for that category
        - Use the historical values to identify patterns for forecasting
        - When predicting, show your reasoning based on the data trend
        - If a tag doesn't exist in the context, say so clearly
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
