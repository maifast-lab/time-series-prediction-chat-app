import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Chat from '@/models/Chat';
import Message from '@/models/Message';
import TimeSeriesData from '@/models/TimeSeriesData';
import {
  GEMINI_TIMEOUT_MS,
  getGeminiErrorDetails,
  getMaifastModel,
  sleep,
} from '@/lib/gemini';
import { resolveChatDataSource } from '@/lib/chat-data-source';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { performVectorSearch } from '@/lib/vector-search';
import { logger } from '@/lib/logger';
import {
  buildSheetJson,
  buildPredictionTrainingContext,
  extractNumericSequence,
  findExactSequenceMatches,
} from '@/lib/time-series';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

async function invokeGeminiWithGuardrails<T>(
  invoke: () => Promise<T>,
  options: { maxAttempts?: number } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await invoke();
    } catch (error) {
      lastError = error;
      const errorDetails = getGeminiErrorDetails(error);

      if (!errorDetails.isRetryable || attempt >= maxAttempts) {
        throw error;
      }

      const waitMs = Math.min(errorDetails.retryAfterMs ?? attempt * 1500, 8000);
      logger.warn('Retrying Gemini request', {
        attempt,
        maxAttempts,
        waitMs,
        statusCode: errorDetails.statusCode,
      });
      await sleep(waitMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Gemini invoke failed');
}

function buildGeminiFallbackMessage(error: unknown): string {
  const details = getGeminiErrorDetails(error);
  const retryAfterSeconds = details.retryAfterMs
    ? Math.max(1, Math.ceil(details.retryAfterMs / 1000))
    : null;

  if (details.isQuotaExceeded) {
    return [
      '**Jawab:** Gemini quota limit hit ho gayi hai, isliye abhi answer generate nahi ho paya.',
      '',
      '**Sheet Evidence:** Data process ho gaya tha, lekin Gemini API ne quota/billing related error diya.',
      '',
      '**Reason:** Google AI Studio ya billing/quota page check kijiye. Free tier par ho to quota reset ke baad phir try kijiye.',
    ].join('\n');
  }

  return [
    '**Jawab:** Gemini abhi temporary issue de raha hai, isliye response complete nahi ho paya.',
    '',
    '**Sheet Evidence:** Request valid thi, lekin Gemini API ne rate limit ya temporary service error return kiya.',
    '',
    `**Reason:** ${
      retryAfterSeconds
        ? `${retryAfterSeconds} second baad same query phir bhejiye.`
        : 'Thodi der baad same query phir bhejiye.'
    }`,
  ].join('\n');
}

function normalizePatternResponse(text: string): string {
  const trimmed = text.trim().replace(/\r\n?/g, '\n');
  const headerMatch = trimmed.match(/^Ye pattern \d+ jgh mila hai\s*:/i);

  if (!headerMatch) {
    return trimmed;
  }

  const header = headerMatch[0].replace(/\s*:\s*$/, ' :');
  const remainder = trimmed.slice(headerMatch[0].length).trim();

  if (!remainder) {
    return header;
  }

  const entryMatches = remainder.match(
    /(?:\d{1,2}(?:st|nd|rd|th)\s+[A-Za-z]+(?:\s+\d{4})?|Row\s+\d+)\s*-\s*-?\d+(?:\.\d+)?/g,
  );

  if (!entryMatches || entryMatches.length === 0) {
    return `${header}  \n${remainder}`;
  }

  return `${header}  \n${entryMatches.join('  \n')}`;
}

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
    const { text } = await req.json();
    const userText = typeof text === 'string' ? text.trim() : '';
    if (!userText)
      return NextResponse.json(
        { error: 'Message text required' },
        { status: 400 },
      );
    const chat = await Chat.findOne({ _id: id, userId: session.user.dbId });
    if (!chat)
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });

    const activeDataSource = await resolveChatDataSource({
      userId: session.user.dbId,
      chatId: String(chat._id),
      dataSourceId: chat.dataSourceId?.toString(),
    });

    if (!activeDataSource) {
      return NextResponse.json(
        { error: 'Upload Excel or CSV before sending a query.' },
        { status: 400 },
      );
    }

    await Message.create({
      chatId: chat._id,
      role: 'user',
      content: userText,
    });

    const schemaMap = `Dataset "${activeDataSource.name}": ${
      activeDataSource.schemaSummary || 'Tabular raw data'
    }`;
    const historyDocs = await TimeSeriesData.find({
      dataSourceId: activeDataSource._id,
    })
      .sort({ tag: 1, date: 1 })
      .select('tag date value -_id');

    const historyPoints = historyDocs.map((doc) => ({
      tag: doc.tag,
      date: doc.date,
      value: doc.value,
    }));
    const querySequence = extractNumericSequence(userText);
    const sequenceMatches = findExactSequenceMatches(historyPoints, querySequence);
    const predictionTraining =
      querySequence.length >= 4
        ? buildPredictionTrainingContext(historyPoints, querySequence, {
            maxWindowSize: Math.min(querySequence.length, 6),
            minWindowSize: 4,
            maxCandidates: 5,
            maxEvidencePerCandidate: 4,
          })
        : null;
    const matchedTags = new Set(sequenceMatches.map((match) => match.tag));
    predictionTraining?.candidates.forEach((candidate) => {
      candidate.sourceTags.forEach((tag) => matchedTags.add(tag));
    });
    const matchedSeriesJson =
      matchedTags.size > 0
        ? buildSheetJson(
            historyPoints.filter((point) => matchedTags.has(point.tag)),
            { maxPointsPerTag: 60 },
          )
        : [];
    const valueLookup =
      querySequence.length > 0
        ? historyPoints
            .filter((point) => querySequence.includes(point.value))
            .slice(-40)
            .map((point) => ({
              tag: point.tag,
              date:
                point.date instanceof Date
                  ? point.date.toISOString().slice(0, 10)
                  : point.date,
              value: point.value,
            }))
        : [];
    const sheetJsonPreview =
      Array.isArray(activeDataSource.data) && activeDataSource.data.length > 0
        ? activeDataSource.data
        : buildSheetJson(historyPoints, { maxPointsPerTag: 25 });
    let contextString = 'No extra tag-specific context found.';
    let vectorHints: string[] = [];

    try {
      const contextResults = await performVectorSearch(
        userText,
        session.user.dbId,
        12,
        {
          dataSourceId: String(activeDataSource._id),
          ...(activeDataSource.chatId
            ? { chatId: String(activeDataSource.chatId) }
            : {}),
        },
      );
      vectorHints = contextResults.map((result: { content: string }) => result.content);
      contextString = contextResults
        .map((r: { content: string }) => `- ${r.content}`)
        .join('\n');
    } catch (vErr) {
      logger.error('Vector Search failed, using uploaded sheet JSON only', vErr);
    }

    logger.info('RAG CONTEXT RETRIEVED');

    const model = getMaifastModel('gemini-2.5-flash', { maxRetries: 0 });
    const sheetJsonContext = JSON.stringify(
      {
        uploadedFile: activeDataSource.name,
        uploadedSummary: activeDataSource.schemaSummary || '',
        querySequence,
        exactSequenceMatches: sequenceMatches,
        predictionTraining,
        matchedSeriesJson,
        valueLookup,
        sheetJsonPreview,
        vectorHints,
      },
      null,
      2,
    );

    const prompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `
You are a data analysis assistant working strictly with JSON data.
The current date and time is {currentDate}.

You will receive one JSON object in {sheetJson}. The user will only provide a sequence of numbers.

YOUR TASK:
- Read the JSON object carefully.
- Treat each JSON series independently.
- Work only with the arrays and objects present in the JSON.
- Use only the JSON fields provided in {sheetJson}.
- Do not use general knowledge.
- Do not predict values mathematically.

JSON STRUCTURE:
- uploadedFile: file name
- uploadedSummary: short summary of the uploaded file
- querySequence: numeric sequence extracted from the user input
- exactSequenceMatches: exact matched windows already found from time-series history
- predictionTraining: supporting pattern context from history
- matchedSeriesJson: matched tag series with values and dated points
- valueLookup: supporting rows where query values appear
- sheetJsonPreview: main sheet JSON array
- vectorHints: supporting tag hints only

JSON SERIES RULES:
- Treat each object inside matchedSeriesJson or sheetJsonPreview as one JSON series.
- In each series object:
  - tag = series name
  - values = values in top-to-bottom order
  - points = row-aligned dated values in top-to-bottom order
  - totalPoints = total available values in that series
- Use matchedSeriesJson first when it contains relevant series for the sequence.
- If matchedSeriesJson is empty or not enough, use sheetJsonPreview.
- exactSequenceMatches, predictionTraining, valueLookup, uploadedSummary, and vectorHints are supporting context only.
- Do not invent series or values outside the JSON.

CORE RULES:
- Search all provided JSON series across the JSON arrays.
- Find series where the full sequence exists in the same series in the same top-to-bottom order.
- The numbers do not need to be on consecutive rows, but they must appear in order.
- Use 1-based row numbers.

FOR EACH MATCHING SERIES:
1. Identify the row positions of each number in that series.
2. Calculate the row gaps between consecutive numbers.
3. Extend the gap pattern logically for that same series only.
4. Determine the next row position.
5. Fetch the value that already exists in that row of the same series.

STRICT CONSTRAINTS:
- Never generate or predict a new number.
- If the user provides more than or less then 4 numbers, return exactly: Exactly 4 numbers provide karo.
- Only return values that already exist in the JSON data.
- Each JSON series is independent; row-gap patterns may vary by series.
- Return results for up to 5 matching series only.
- If more than 5 matches exist, return the first 5 series in the order they appear in the JSON arrays.

VALIDATION RULES:
- Ensure all sequence values exist in the same JSON series.
- Ensure row positions are strictly increasing.
- Ensure the computed next row exists within that series values/points bounds.
- If the next row is out of bounds, ignore that series.

OUTPUT RULES: 
- Return plain text only. Do not return JSON.
- Do not add Markdown, headings, explanations, comments, or extra text.
- If matches exist, return in this exact dynamic format:
Ye pattern <actual match count> jgh mila hai : 
<next row date in readable format> - <next value from JSON> ,
<next row date in readable format> - <next value from JSON> ,
- Put every matched result on its own new line. Never place multiple results on one line.
- The first line must contain the real number of matched series you are returning.
- Each line after the first must represent one matched series only.
- For each matched series, use the date from that series' points array at the computed next row.
- Format the date in a readable style like: 15th April
- If a date is unavailable for a matched series, use: Row <next row number> - <next value>
- Do not include series names, row gaps, row positions, or any extra wording unless the user explicitly asks for them.
- If no series matches, return exactly: Ye pattern nhi mila

AVAILABLE DATA SOURCES:
{schemaMap}

UPLOADED SHEET JSON:
{sheetJson}

EXTRA TIME-SERIES CONTEXT:
{context}
        `,
      ],
      ['human', '{input}'],
    ]);
    const chain = prompt.pipe(model).pipe(new StringOutputParser());

    let aiText: string;

    try {
      aiText = await invokeGeminiWithGuardrails(
        () =>
          chain.invoke(
            {
              company: chat.company,
              place: chat.place,
              currentDate: new Date().toLocaleString('en-US', {
                timeZone: 'Asia/Kolkata',
              }),
              schemaMap,
              context: contextString,
              sheetJson: sheetJsonContext,
              input: userText,
            },
            { timeout: GEMINI_TIMEOUT_MS },
          ),
        { maxAttempts: 2 },
      );
    } catch (modelError) {
      const errorDetails = getGeminiErrorDetails(modelError);
      logger.error('Gemini message generation failed', modelError, errorDetails);

      const assistantMsg = await Message.create({
        chatId: chat._id,
        role: 'assistant',
        content: buildGeminiFallbackMessage(modelError),
        type: 'text',
        metadata: {
          provider: 'gemini',
          providerError: true,
          statusCode: errorDetails.statusCode,
          retryAfterMs: errorDetails.retryAfterMs,
          isQuotaExceeded: errorDetails.isQuotaExceeded,
        },
      });

      return NextResponse.json(assistantMsg);
    }

    const finalResponse = normalizePatternResponse(aiText);
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
        const generatedTitle = await invokeGeminiWithGuardrails(
          () =>
            titleChain.invoke(
              { input: userText },
              { timeout: Math.min(GEMINI_TIMEOUT_MS, 15000) },
            ),
          { maxAttempts: 1 },
        );

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
