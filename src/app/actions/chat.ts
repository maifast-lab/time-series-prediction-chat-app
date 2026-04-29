'use server';

import { logger } from '@/lib/logger';
import { createChatForCurrentUser, deleteChatForCurrentUser, sendChatMessageForCurrentUser } from '@/lib/server/chat';
import { getActionErrorMessage } from '@/lib/server/errors';

export async function createChatAction(input?: {
  company?: string;
  place?: string;
}) {
  try {
    const chat = await createChatForCurrentUser(input);
    return { ok: true as const, data: chat };
  } catch (error) {
    logger.error('Create chat action failed', error);
    return {
      ok: false as const,
      error: getActionErrorMessage(error),
    };
  }
}

export async function deleteChatAction(chatId: string) {
  try {
    await deleteChatForCurrentUser(chatId);
    return { ok: true as const };
  } catch (error) {
    logger.error('Delete chat action failed', error);
    return {
      ok: false as const,
      error: getActionErrorMessage(error),
    };
  }
}

export async function sendChatMessageAction(chatId: string, text: string) {
  try {
    const result = await sendChatMessageForCurrentUser({ chatId, text });
    return { ok: true as const, data: result };
  } catch (error) {
    logger.error('Send message action failed', error);
    return {
      ok: false as const,
      error: getActionErrorMessage(error),
    };
  }
}
