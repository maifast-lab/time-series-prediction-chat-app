'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import ChatComposer from '@/components/chat-page/ChatComposer';
import ChatHeader from '@/components/chat-page/ChatHeader';
import ChatMessagesPane from '@/components/chat-page/ChatMessagesPane';
import { useSheetDataStatus } from '@/components/sheet-editor/sheet-editor-queries';
import { ApiClientError } from '@/lib/api-client';
import {
  fetchJobStatus,
  useRenameChatMutation,
  useSendChatMessageMutation,
} from '@/lib/api-hooks';
import { clearStoredAuth } from '@/lib/auth-client';
import {
  CHAT_RENAMED_EVENT,
  DATA_SOURCE_UPLOADED_EVENT,
  type ChatRenamedEventDetail,
} from '@/lib/app-events';
import type {
  ChatPageData,
  ChatMessage,
} from '@/lib/chat-types';
import { logger } from '@/lib/logger';

interface ChatPageClientProps {
  initialChat: ChatPageData['chat'];
  initialMessages: ChatPageData['messages'];
  initialHasUploadedData: ChatPageData['hasUploadedData'];
  initialActiveSheetDataName: ChatPageData['activeSheetDataName'];
}

export default function ChatPageClient({
  initialChat,
  initialMessages,
  initialHasUploadedData,
  initialActiveSheetDataName,
}: ChatPageClientProps) {
  const router = useRouter();
  const [chat, setChat] = useState(initialChat);
  const [chatMessages, setChatMessages] = useState(initialMessages);
  const [localHasUploadedData, setLocalHasUploadedData] =
    useState(initialHasUploadedData);
  const [activeSheetDataName] = useState(
    initialActiveSheetDataName,
  );
  const [isResponding, setIsResponding] = useState(false);
  const [inputText, setInputText] = useState('');
  const [composerNotice, setComposerNotice] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sheetStatusQuery = useSheetDataStatus(true);
  const hasUploadedData =
    sheetStatusQuery.data?.hasSheetData ?? localHasUploadedData;
  const sendMessageMutation = useSendChatMessageMutation(chat._id);
  const renameChatMutation = useRenameChatMutation(chat._id);
  const pendingJobIds = chatMessages
    .filter((message) => message.jobId && message.isLoading)
    .map((message) => message.jobId as string);
  const pendingJobKey = pendingJobIds.join('|');

  useEffect(() => {
    if (!isResponding) {
      inputRef.current?.focus();
    }
  }, [isResponding]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isResponding]);

  useEffect(() => {
    const jobIds = pendingJobKey ? pendingJobKey.split('|').filter(Boolean) : [];

    if (jobIds.length === 0) {
      return;
    }

    let isActive = true;

    async function pollJobs() {
      await Promise.all(
        jobIds.map(async (jobId) => {
          try {
            const result = await fetchJobStatus(jobId);

            if (!isActive) {
              return;
            }

            setChatMessages((current) =>
              current.map((message) =>
                message.jobId === result.jobId ? result.message : message,
              ),
            );
          } catch (error) {
            if (error instanceof ApiClientError && error.status === 401) {
              clearStoredAuth();
              router.push('/login');
              return;
            }

            logger.warn('Job status polling failed', {
              jobId,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }),
      );
    }

    void pollJobs();
    const intervalId = window.setInterval(() => {
      void pollJobs();
    }, 2500);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [pendingJobKey, router]);

  useEffect(() => {
    function handleChatRenamed(event: Event) {
      const detail = (event as CustomEvent<ChatRenamedEventDetail>).detail;

      if (!detail || detail.chatId !== chat._id) {
        return;
      }

      setChat((prev) => ({
        ...prev,
        company: detail.company,
      }));
    }

    window.addEventListener(CHAT_RENAMED_EVENT, handleChatRenamed);
    return () =>
      window.removeEventListener(CHAT_RENAMED_EVENT, handleChatRenamed);
  }, [chat._id]);

  useEffect(() => {
    function handleDataUpload() {
      setComposerNotice('');
      setLocalHasUploadedData(true);
    }

    window.addEventListener(DATA_SOURCE_UPLOADED_EVENT, handleDataUpload);
    return () =>
      window.removeEventListener(DATA_SOURCE_UPLOADED_EVENT, handleDataUpload);
  }, []);

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const userText = inputText.trim();

    if (!userText) {
      return;
    }

    setComposerNotice('');
    setInputText('');
    setIsResponding(true);

    const optimisticMessage: ChatMessage = {
      _id: `temp-${Date.now()}`,
      role: 'user',
      content: userText,
      createdAt: new Date().toISOString(),
    };

    setChatMessages((prev) => [...prev, optimisticMessage]);

    try {
      const result = await sendMessageMutation.mutateAsync(userText);

      setChatMessages((prev) => [...prev, result.message]);

      if (result.chatTitle) {
        setChat((prev) => ({
          ...prev,
          company: result.chatTitle || prev.company,
        }));

        window.dispatchEvent(
          new CustomEvent(CHAT_RENAMED_EVENT, {
            detail: {
              chatId: chat._id,
              company: result.chatTitle,
            },
          }),
        );
      }
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        clearStoredAuth();
        router.push('/login');
        return;
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Please try again.';

      if (error instanceof ApiClientError) {
        logger.warn('Send message failed', {
          status: error.status,
          error: error.message,
        });
      } else {
        logger.error('Send message failed', error);
      }

      setComposerNotice(errorMessage);
      setChatMessages((prev) => [
        ...prev,
        {
          _id: `err-${Date.now()}`,
          role: 'assistant',
          content: `Sorry, I encountered an error: ${errorMessage}`,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsResponding(false);
    }
  }

  async function handleRenameChat(nextName: string) {
    try {
      const updatedChat = await renameChatMutation.mutateAsync(nextName);
      setChat((prev) => ({
        ...prev,
        company: updatedChat.company,
      }));

      window.dispatchEvent(
        new CustomEvent(CHAT_RENAMED_EVENT, {
          detail: {
            chatId: chat._id,
            company: updatedChat.company,
          },
        }),
      );
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        clearStoredAuth();
        router.push('/login');
        throw error;
      }

      throw error;
    }
  }

  return (
    <div className='flex h-full flex-col'>
      <ChatHeader
        chat={chat}
        onRename={handleRenameChat}
        isRenaming={renameChatMutation.isPending}
      />
      <ChatMessagesPane
        messages={chatMessages}
        isResponding={isResponding}
        messagesEndRef={messagesEndRef}
      />
      <ChatComposer
        inputRef={inputRef}
        inputText={inputText}
        hasUploadedData={hasUploadedData}
        isResponding={isResponding}
        activeSheetDataName={activeSheetDataName}
        composerNotice={composerNotice}
        onInputChange={setInputText}
        onSubmit={handleSendMessage}
      />
    </div>
  );
}
