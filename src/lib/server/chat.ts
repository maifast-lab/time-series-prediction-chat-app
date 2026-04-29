import 'server-only';

import { unstable_noStore as noStore } from 'next/cache';
import mongoose from 'mongoose';

import { resolveChatDataSource } from '@/lib/chat-data-source';
import dbConnect from '@/lib/db';
import { getGeminiErrorDetails } from '@/lib/gemini';
import {
  buildGeminiFallbackMessage,
  routeMessageWithGemini,
} from '@/lib/gemini-message-router';
import { logger } from '@/lib/logger';
import type {
  ChatMessage,
  ChatPageData,
  ChatSummary,
} from '@/lib/chat-types';
import {
  buildPatternAnswer,
  buildReadableDataHistoryPoints,
  findPatternMatches,
  type HistoryPoint,
  isReadableYearMonthData,
  type PatternMatch,
} from '@/lib/pattern-matcher';
import Chat from '@/models/Chat';
import Message from '@/models/Message';
import TimeSeriesData from '@/models/TimeSeriesData';

import { getCurrentUserDbId, requireCurrentUserDbId } from './auth';
import { NotFoundError, ValidationError } from './errors';

type ActiveDataSource = Awaited<ReturnType<typeof resolveChatDataSource>>;
type ResolvedDataSource = NonNullable<ActiveDataSource>;

const ROW_GRID_SUMMARY_MARKER =
  'Row-based numeric grid detected without real dates';

function serializeChatSummary(chat: {
  _id: unknown;
  company?: string;
  place?: string;
  createdAt?: Date | string;
}): ChatSummary {
  return {
    _id: String(chat._id),
    company: chat.company || 'New Chat',
    place: chat.place || 'General',
    createdAt: new Date(chat.createdAt ?? Date.now()).toISOString(),
  };
}

function serializeMessage(message: {
  _id: unknown;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: Date | string;
}): ChatMessage {
  return {
    _id: String(message._id),
    role: message.role,
    content: message.content,
    createdAt: new Date(message.createdAt ?? Date.now()).toISOString(),
  };
}

function buildChatTitle(text: string) {
  const words = text
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);

  return words.length > 0 ? words.join(' ') : 'New Chat';
}

function isRowGridSource(dataSource: ResolvedDataSource | null) {
  return dataSource?.schemaSummary?.includes(ROW_GRID_SUMMARY_MARKER) || false;
}

async function getStoredHistoryPoints(
  dataSource: ResolvedDataSource,
): Promise<HistoryPoint[]> {
  const historyDocs = await TimeSeriesData.find({
    dataSourceId: dataSource._id,
  })
    .sort({ tag: 1, date: 1 })
    .select('tag date value -_id')
    .lean();

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
    ).reverse();
  }

  return findPatternMatches(
    await getStoredHistoryPoints(dataSource),
    sequence,
  ).reverse();
}

async function createAssistantMessage(options: {
  chatId: unknown;
  content: string;
  metadata: Record<string, unknown>;
}) {
  return Message.create({
    chatId: options.chatId,
    role: 'assistant',
    content: options.content,
    type: 'text',
    metadata: options.metadata,
  });
}

export async function getChatsForCurrentUser() {
  noStore();

  const userId = await getCurrentUserDbId();
  if (!userId) {
    return [] satisfies ChatSummary[];
  }

  await dbConnect();
  const chats = await Chat.find({
    userId,
    isDeleted: { $ne: true },
  })
    .sort({ createdAt: -1 })
    .lean();

  return chats.map(serializeChatSummary);
}

export async function getLatestChatIdForCurrentUser() {
  noStore();

  const userId = await getCurrentUserDbId();
  if (!userId) {
    return null;
  }

  await dbConnect();
  const latestChat = await Chat.findOne({
    userId,
    isDeleted: { $ne: true },
  })
    .sort({ createdAt: -1 })
    .select('_id')
    .lean();

  return latestChat ? String(latestChat._id) : null;
}

export async function createChatForCurrentUser(input?: {
  company?: string;
  place?: string;
}) {
  const userId = await requireCurrentUserDbId();

  await dbConnect();
  const chat = await Chat.create({
    userId,
    company: input?.company || 'New Chat',
    place: input?.place || 'General',
  });

  return serializeChatSummary(chat);
}

export async function getChatPageDataForCurrentUser(chatId: string) {
  noStore();

  const userId = await requireCurrentUserDbId();
  await dbConnect();

  const chat = await Chat.findOne({
    _id: chatId,
    userId,
  }).lean();

  if (!chat || chat.isDeleted) {
    throw new NotFoundError('Chat not found');
  }

  const [messages, activeDataSource] = await Promise.all([
    Message.find({ chatId })
      .sort({ createdAt: 1 })
      .lean(),
    resolveChatDataSource({
      userId,
      chatId: String(chat._id),
      dataSourceId: chat.dataSourceId?.toString(),
    }),
  ]);

  const chatData: ChatPageData = {
    chat: {
      _id: String(chat._id),
      company: chat.company || 'New Chat',
      place: chat.place || 'General',
    },
    messages: messages.map(serializeMessage),
    hasUploadedData: Boolean(activeDataSource),
    activeDataSourceName: activeDataSource?.name || '',
  };

  return chatData;
}

export async function deleteChatForCurrentUser(chatId: string) {
  const userId = await requireCurrentUserDbId();
  await dbConnect();

  if (!mongoose.Types.ObjectId.isValid(chatId)) {
    throw new ValidationError('Invalid Chat ID');
  }

  const chat = await Chat.findOneAndUpdate(
    { _id: chatId, userId },
    { isDeleted: true },
    { new: true },
  );

  if (!chat) {
    throw new NotFoundError('Chat not found');
  }
}

export async function sendChatMessageForCurrentUser(options: {
  chatId: string;
  text: string;
}) {
  const userId = await requireCurrentUserDbId();
  await dbConnect();

  const userText = options.text.trim();
  if (!userText) {
    throw new ValidationError('Message text required');
  }

  const chat = await Chat.findOne({ _id: options.chatId, userId });
  if (!chat || chat.isDeleted) {
    throw new NotFoundError('Chat not found');
  }

  const activeDataSource = await resolveChatDataSource({
    userId,
    chatId: String(chat._id),
    dataSourceId: chat.dataSourceId?.toString(),
  });
  const metadata: Record<string, unknown> = {
    uploadedFile: activeDataSource?.name,
  };

  await Message.create({
    chatId: chat._id,
    role: 'user',
    content: userText,
  });

  let finalResponse: string;

  try {
    const routeDecision = await routeMessageWithGemini({
      userText,
      dataSource: activeDataSource,
    });
    const querySequence =
      routeDecision.mode === 'pattern' ? routeDecision.sequence : null;

    metadata.provider =
      querySequence === null
        ? 'gemini-router'
        : 'gemini-router+deterministic-pattern-matcher';
    metadata.routeMode = routeDecision.mode;
    metadata.routeReason = routeDecision.reason;
    metadata.querySequence = querySequence;
    metadata.patternAnswer = routeDecision.patternAnswer;

    if (!querySequence) {
      finalResponse = routeDecision.answer;
    } else if (!activeDataSource) {
      finalResponse =
        routeDecision.patternAnswer?.uploadRequired ||
        'Pattern nikalne ke liye pehle Excel ya CSV upload karo.';
    } else {
      const matches = await findMatchesForDataSource({
        dataSource: activeDataSource,
        sequence: querySequence,
        isRowGrid: isRowGridSource(activeDataSource),
      });

      finalResponse = buildPatternAnswer(matches, {
        isRowGridSource: isRowGridSource(activeDataSource),
        phrases: routeDecision.patternAnswer,
      });
    }
  } catch (geminiError) {
    const errorDetails = getGeminiErrorDetails(geminiError);

    logger.error('Gemini route decision failed', geminiError, errorDetails);
    metadata.provider = 'gemini-router';
    metadata.providerError = true;
    metadata.statusCode = errorDetails.statusCode;
    metadata.retryAfterMs = errorDetails.retryAfterMs;
    metadata.isQuotaExceeded = errorDetails.isQuotaExceeded;
    finalResponse = buildGeminiFallbackMessage(geminiError);
  }

  const assistantMessage = await createAssistantMessage({
    chatId: chat._id,
    content: finalResponse,
    metadata,
  });

  let chatTitle: string | null = null;
  if (chat.company === 'New Chat') {
    chatTitle = buildChatTitle(userText);
    await Chat.findByIdAndUpdate(chat._id, {
      company: chatTitle,
    });
  }

  return {
    message: serializeMessage(assistantMessage),
    chatTitle,
  };
}
