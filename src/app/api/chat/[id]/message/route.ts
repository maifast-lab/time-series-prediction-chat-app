import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveChatDataSource } from "@/lib/chat-data-source";
import dbConnect from "@/lib/db";
import { getGeminiErrorDetails } from "@/lib/gemini";
import {
  buildGeminiFallbackMessage,
  routeMessageWithGemini,
} from "@/lib/gemini-message-router";
import { logger } from "@/lib/logger";
import {
  buildPatternAnswer,
  buildReadableDataHistoryPoints,
  findPatternMatches,
  type HistoryPoint,
  isReadableYearMonthData,
  type PatternMatch,
} from "@/lib/pattern-matcher";
import Chat from "@/models/Chat";
import Message from "@/models/Message";
import TimeSeriesData from "@/models/TimeSeriesData";

type ActiveDataSource = Awaited<ReturnType<typeof resolveChatDataSource>>;
type ResolvedDataSource = NonNullable<ActiveDataSource>;

const ROW_GRID_SUMMARY_MARKER =
  "Row-based numeric grid detected without real dates";

function buildChatTitle(text: string): string {
  const words = text
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);

  return words.length > 0 ? words.join(" ") : "New Chat";
}

function isRowGridSource(dataSource: ResolvedDataSource | null): boolean {
  return dataSource?.schemaSummary?.includes(ROW_GRID_SUMMARY_MARKER) || false;
}

async function getStoredHistoryPoints(
  dataSource: ResolvedDataSource,
): Promise<HistoryPoint[]> {
  const historyDocs = await TimeSeriesData.find({
    dataSourceId: dataSource._id,
  })
    .sort({ tag: 1, date: 1 })
    .select("tag date value -_id");

  return historyDocs.map((doc) => ({
    tag: doc.tag,
    date: doc.date,
    value: doc.value,
  }));
}

async function findMatchesForDataSource(options: {
  dataSource: ResolvedDataSource;
  sequence: number[];
  isRowGrid: boolean;
}): Promise<PatternMatch[]> {
  const { dataSource, sequence, isRowGrid } = options;

  if (!isRowGrid && isReadableYearMonthData(dataSource.data)) {
    return findPatternMatches(
      buildReadableDataHistoryPoints(dataSource.data),
      sequence,
    );
  }

  return findPatternMatches(await getStoredHistoryPoints(dataSource), sequence);
}

async function createAssistantMessage(options: {
  chatId: unknown;
  content: string;
  metadata: Record<string, unknown>;
}) {
  return Message.create({
    chatId: options.chatId,
    role: "assistant",
    content: options.content,
    type: "text",
    metadata: options.metadata,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.dbId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await dbConnect();
    const { id } = await params;
    const { text } = await req.json();
    const userText = typeof text === "string" ? text.trim() : "";
    if (!userText) {
      return NextResponse.json(
        { error: "Message text required" },
        { status: 400 },
      );
    }
    const chat = await Chat.findOne({ _id: id, userId: session.user.dbId });
    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const activeDataSource = await resolveChatDataSource({
      userId: session.user.dbId,
      chatId: String(chat._id),
      dataSourceId: chat.dataSourceId?.toString(),
    });
    const metadata: Record<string, unknown> = {
      uploadedFile: activeDataSource?.name,
    };

    await Message.create({
      chatId: chat._id,
      role: "user",
      content: userText,
    });
    let finalResponse: string;
    try {
      const routeDecision = await routeMessageWithGemini({
        userText,
        dataSource: activeDataSource,
      });
      const querySequence =
        routeDecision.mode === "pattern" ? routeDecision.sequence : null;
      metadata.provider =
        querySequence === null
          ? "gemini-router"
          : "gemini-router+deterministic-pattern-matcher";
      metadata.routeMode = routeDecision.mode;
      metadata.routeReason = routeDecision.reason;
      metadata.querySequence = querySequence;
      if (!querySequence) {
        finalResponse = routeDecision.answer;
      } else if (!activeDataSource) {
        finalResponse =
          "Pattern nikalne ke liye pehle Excel ya CSV upload karo.";
      } else {
        const rowGrid = isRowGridSource(activeDataSource);
        const matches = await findMatchesForDataSource({
          dataSource: activeDataSource,
          sequence: querySequence,
          isRowGrid: rowGrid,
        });

        finalResponse = buildPatternAnswer(matches, {
          isRowGridSource: rowGrid,
        });
      }
    } catch (geminiError) {
      const errorDetails = getGeminiErrorDetails(geminiError);
      logger.error("Gemini route decision failed", geminiError, errorDetails);

      metadata.provider = "gemini-router";
      metadata.providerError = true;
      metadata.statusCode = errorDetails.statusCode;
      metadata.retryAfterMs = errorDetails.retryAfterMs;
      metadata.isQuotaExceeded = errorDetails.isQuotaExceeded;
      finalResponse = buildGeminiFallbackMessage(geminiError);
    }

    const assistantMsg = await createAssistantMessage({
      chatId: chat._id,
      content: finalResponse,
      metadata,
    });

    if (chat.company === "New Chat") {
      await Chat.findByIdAndUpdate(chat._id, {
        company: buildChatTitle(userText),
      });
    }

    return NextResponse.json(assistantMsg);
  } catch (error: unknown) {
    logger.error("Message Error", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
