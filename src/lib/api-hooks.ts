'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { requestApi } from '@/lib/api-client';
import type {
  ChatSummary,
  ChatsOverviewData,
  SendChatMessageResult,
} from '@/lib/chat-types';

export const apiQueryKeys = {
  chatsOverview: ['chats-overview'] as const,
};

export function useChatsOverviewQuery({
  enabled = true,
  initialChats,
}: {
  enabled?: boolean;
  initialChats?: ChatSummary[];
} = {}) {
  return useQuery({
    queryKey: apiQueryKeys.chatsOverview,
    queryFn: () => requestApi<ChatsOverviewData>('/api/chats'),
    enabled,
    initialData: initialChats
      ? {
          chats: initialChats,
          latestChatId: initialChats[0]?._id ?? null,
        }
      : undefined,
    initialDataUpdatedAt: initialChats ? 0 : undefined,
  });
}

export function useCreateChatMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      requestApi<ChatSummary>('/api/chats', {
        method: 'POST',
      }),
    onSuccess: (chat) => {
      queryClient.setQueryData<ChatsOverviewData>(
        apiQueryKeys.chatsOverview,
        (current) => ({
          latestChatId: chat._id,
          chats: [
            chat,
            ...(current?.chats.filter((item) => item._id !== chat._id) ?? []),
          ],
        }),
      );
    },
  });
}

export function useDeleteChatMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (chatId: string) =>
      requestApi<null>(`/api/chats/${chatId}`, {
        method: 'DELETE',
      }),
    onSuccess: (_data, chatId) => {
      queryClient.setQueryData<ChatsOverviewData>(
        apiQueryKeys.chatsOverview,
        (current) => {
          const chats = current?.chats.filter((chat) => chat._id !== chatId) ?? [];

          return {
            chats,
            latestChatId:
              current?.latestChatId === chatId
                ? chats[0]?._id ?? null
                : current?.latestChatId ?? chats[0]?._id ?? null,
          };
        },
      );
    },
  });
}

export function useSendChatMessageMutation(chatId: string) {
  return useMutation({
    mutationFn: (text: string) =>
      requestApi<SendChatMessageResult>(`/api/chats/${chatId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      }),
  });
}

export function useSubmitSuggestionMutation() {
  return useMutation({
    mutationFn: (payload: { title: string; description: string }) =>
      requestApi<unknown>('/api/suggestion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }),
  });
}
