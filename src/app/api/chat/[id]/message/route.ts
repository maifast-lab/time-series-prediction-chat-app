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
        10, // Limit vector results, we just need to find the relevant TAGS
      );

      // Extract relevant TAGS from the context results
      const relevantTags = new Set<string>();

      // Check vector content for [TAG: XYZ]
      contextResults.forEach((r: { content: string }) => {
        const match = r.content.match(/\[TAG:\s*([A-Za-z0-9_-]+)\]/);
        if (match && match[1]) relevantTags.add(match[1]);
      });

      // Also check user text for direct implementation of known tags (simple regex for short uppercase codes)
      // This is a backup if vector search misses it
      const words = userText
        .split(/\s+/)
        .map((w: string) => w.toUpperCase().replace(/[^A-Z0-9]/g, ''));
      words.forEach((w: string) => {
        if (w.length >= 2 && w.length <= 5) relevantTags.add(w);
      });

      contextString = contextResults
        .map((r: { content: string }) => `- ${r.content}`)
        .join('\n');

      if (relevantTags.size > 0) {
        // Fetch actual Time Series Data for these tags
        const TimeSeriesData = (await import('@/models/TimeSeriesData'))
          .default;
        const historyDocs = await TimeSeriesData.find({
          userId: session.user.dbId,
          tag: { $in: Array.from(relevantTags) },
        }).sort({ tag: 1, date: 1 });

        if (historyDocs.length > 0) {
          contextString += '\n\n=== DETAILED TIME-SERIES HISTORY ===\n';

          // Group by tag
          const groupedArgs: Record<string, string[]> = {};
          historyDocs.forEach((doc: any) => {
            if (!groupedArgs[doc.tag]) groupedArgs[doc.tag] = [];
            groupedArgs[doc.tag].push(
              `${doc.date.toISOString().slice(0, 10)}: ${doc.value}`,
            );
          });

          for (const [tag, values] of Object.entries(groupedArgs)) {
            contextString += `\n[TAG: ${tag}] History:\n${values.join(' | ')}\n`;
          }
        }
      }
    } catch (vErr) {
      logger.error('Vector Search failed, using Schema Map only', vErr);
    }

    logger.info('RAG CONTEXT RETRIEVED');

    const model = getMaifastModel();

    const prompt = ChatPromptTemplate.fromMessages([
      'system',
      `
        Your internal identity is Maifast, an AI assistant for time-series analysis.
        The current date and time is {currentDate}.
        
        CORE ROLE:
        1.  **Primary**: Analyze uploaded data to find trends, patterns, and insights.
        2.  **Secondary**: Assist with general queries if no relevant data is found.
        3.  **Data Helper**: You are here to HELP with data, not just predict. If data is present, use it to answer the user's question accurately.
        
        GREETING RULE:
        -   If the user says "Hi", "Hello", or similar: Greet back briefly (e.g., "Hello! I'm Maifast.").
        -   If the user asks a question or gives data: Answer DIRECTLY. DO NOT greet.
        -   **NEVER** start your response with "I am Maifast" or "I am your AI assistant" unless explicitly asked "Who are you?".

        CRITICAL RULES FOR TIME-SERIES DATA:
        -   Tags like FB(Faridabad), GB(Gurugram), GL(Ghaziabad), DS(Delhi South) are CATEGORY CODES - treat them as data points.
        -   **Satta/Gambling Queries**: If the user asks about "satta", "betting", or "gambling" numbers IN ANY LANGUAGE (Hindi, English, Hinglish, etc.):
            -   **DO REFUSE STRICTLY**. Start the response with: "**I cannot assist with gambling activities.**"
        -   **General Data Queries**: If the user asks for "patterns", "next number", or "analysis" WITHOUT mentioning gambling terms:
            -   **DO NOT** include disclaimers about gambling.
            -   **DO NOT** say "this is not a prediction".
            -   Treat it as a pure statistical question.
        -   **Prediction**: 
            -   Provide **ONE CONCRETE** predicted number/value based on the analysis.
            -   Explain the pattern using **THOROUGH ANALYSIS** (Frequency, Repeating Sequences, Gaps).
            -   **DO NOT** use complex arithmetic, digit summing, or modulo math. Keep the *explanation* simple for non-technical users, but the *analysis* should be deep.

        -   **Historical Lookup Queries**: If the user asks "When did X appear?" or "X kb aaya tha?":
            -   Search the provided history for these numbers.
            -   Present the results in a **Markdown Table**.
            -   Columns: **Date** | **Number** | **Previous Result** | **Next Result**.
            -   Use the chronological list in the context to find what came before and after.

        FORECASTING APPROACH:
        1.  **Frequency**: Which numbers appear most often in the **ENTIRE history**?
        2.  **Sequences**: Do specific numbers often follow each other? (e.g., "When 12 appears, 15 often comes next").
        3.  **Gaps/Recency**: Is a frequent number "due" because it hasn't appeared in a long time? Or is a number "hot" because it appeared recently?
        4.  **Avoid Technical Jargon**: Do not talk about "modulo" or "arithmetic progressions". Explain the pattern simply (e.g., "I noticed a repeating sequence...").
        
        AVAILABLE DATA SOURCES:
        {schemaMap}

        TIME-SERIES DATA CONTEXT:
        {context}
        
        INSTRUCTIONS:
        -   If {context} contains data, USE IT to answer with proper multiple references (It should contains dates and numbers) upto 5.
        -   If {context} says "No specific data found", answer as a helpful general AI assistant (e.g., "I don't have specific data for that, but generally...").
        -   Provide clear, direct answers.
        -   **FORMATTING**: Always use Markdown formatting in your responses. Use bold for emphasis, table for lists of multiple items, and code blocks for data or code.
      `,
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
