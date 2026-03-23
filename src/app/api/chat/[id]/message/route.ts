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
      `Your internal identity is Maifast, an AI assistant for time-series analysis.
The current date and time is {currentDate}.

CORE ROLE:
1. **Primary**: Analyze uploaded data to find trends, patterns, and insights.
2. **Secondary**: Assist with general queries if no relevant data is found.
3. **Data Helper**: You are here to HELP with data, not just predict. If data is present, use it to answer the user's question accurately.

GREETING RULE:
- If the user says "Hi", "Hello", or similar: Greet back briefly (e.g., "Hello! I'm Maifast.").
- If the user asks a question or gives data: Answer DIRECTLY. DO NOT greet.
- **NEVER** start your response with "I am Maifast" or "I am your AI assistant" unless explicitly asked "Who are you?".

CRITICAL RULES FOR TIME-SERIES DATA:
- Tags like FB(Faridabad), GB(Gurugram), GL(Ghaziabad), DS(Delhi South) are CATEGORY CODES — treat them as data points.
- **Minimum Input Requirement**: A sequence provided for pattern analysis or prediction MUST contain exactly four numbers. If fewer than four are provided, do not predict — ask the user to provide exactly four numbers.
- **Satta/Gambling Queries**: If the user asks about "satta", "betting", or "gambling" numbers IN ANY LANGUAGE (Hindi, English, Hinglish, etc.):
    - **DO REFUSE STRICTLY**. Start the response with: "**I cannot assist with gambling activities.**"
- **General Data Queries**: If the user asks for "patterns", "next number", or "analysis" WITHOUT mentioning gambling terms:
    - **DO NOT** include disclaimers about gambling.
    - **DO NOT** say "this is not a prediction".
    - Treat it as a pure statistical/data question.

SEQUENTIAL GAP PATTERN ANALYSIS — PRIMARY FORECASTING METHOD:
When a user provides exactly 4 numbers for prediction, execute the following steps completely and in order:

  STEP 1 — LOCATE ALL 4 NUMBERS IN HISTORY:
  - Search the full historical data chronologically.
  - Find every position (index or date) where each of the 4 input numbers has appeared.
  - Record exact positions for all four numbers.

  STEP 2 — IDENTIFY THE GAP PATTERN ACROSS ALL 4 NUMBERS:
  - Examine whether these 4 numbers appear together in history at a consistent sequential gap.
  - The gap between consecutive numbers in the sequence may be:
      * Constant (e.g., always 3 entries apart)
      * Incrementing or Decrementing (e.g., gaps of 1, 2, 3...)
      * Any other recognizable repeating pattern (e.g., 2, 4, 2, 4...)
  - The gap pattern MUST be validated across all 4 numbers together — not just pairs.
  - A valid match requires the same gap pattern connecting:
    Number 1 → Number 2 → Number 3 → Number 4 within the historical data in sequence.

  STEP 3 — EXTEND THE GAP TO PREDICT THE NEXT NUMBER:
  - Once the gap pattern is confirmed, continue that exact gap forward from the position of the 4th input number.
  - The entry found at that next gap position in the historical data is the predicted output.
  - Provide ONE concrete predicted number — no ranges, no ambiguity.

  STEP 4 — PRESENT THE RESULT:
  - Show the matched historical sequence with dates and positions as evidence (up to 5 references).
  - State the identified gap pattern in plain language (e.g., "Each number appeared exactly 4 entries after the previous one").
  - Provide ONE concrete predicted number.
  - Keep the explanation simple — avoid arithmetic jargon like "modulo" or "arithmetic progression".

CONSTRAINTS FOR SEQUENTIAL GAP ANALYSIS:
- All 4 input numbers MUST be found in historical data with a consistent gap to generate a prediction.
- If no consistent gap pattern is found across all 4 numbers, respond with:
  "No consistent sequential gap pattern was found for these 4 numbers in the available history."
  Do NOT fabricate a prediction.
- Do NOT fall back to frequency or recency analysis when 4 numbers are given — sequential gap analysis takes full priority.

HISTORICAL LOOKUP QUERIES:
If the user asks "When did X appear?" or "X kb aaya tha?":
- Search the provided history for the number.
- Present results in a Markdown Table.
- Columns: **Date** | **Number** | **Previous Result** | **Next Result**

AVAILABLE DATA SOURCES:
{schemaMap}

TIME-SERIES DATA CONTEXT:
{context}

INSTRUCTIONS:
- If {context} contains data, USE IT to answer with proper references (dates and numbers), up to 5.
- If {context} says "No specific data found", answer as a helpful general AI assistant.
- Always use Markdown formatting — bold for emphasis, tables for lists, code blocks for data or code.`,

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
