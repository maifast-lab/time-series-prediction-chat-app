'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import ChatComposer from '@/components/chat-page/ChatComposer';
import ChatHeader from '@/components/chat-page/ChatHeader';
import ChatMessagesPane from '@/components/chat-page/ChatMessagesPane';
import { ApiClientError, requestApi } from '@/lib/api-client';
import type {
  ChatPageData,
  ChatMessage,
  SendChatMessageResult,
} from '@/lib/chat-types';
import { logger } from '@/lib/logger';

interface ChatPageClientProps {
  initialChat: ChatPageData['chat'];
  initialMessages: ChatPageData['messages'];
  initialHasUploadedData: ChatPageData['hasUploadedData'];
  initialActiveDataSourceName: ChatPageData['activeDataSourceName'];
}

export default function ChatPageClient({
  initialChat,
  initialMessages,
  initialHasUploadedData,
  initialActiveDataSourceName,
}: ChatPageClientProps) {
  const router = useRouter();
  const [chat, setChat] = useState(initialChat);
  const [chatMessages, setChatMessages] = useState(initialMessages);
  const [hasUploadedData, setHasUploadedData] = useState(initialHasUploadedData);
  const [activeDataSourceName, setActiveDataSourceName] = useState(
    initialActiveDataSourceName,
  );
  const [isResponding, setIsResponding] = useState(false);
  const [inputText, setInputText] = useState('');
  const [composerNotice, setComposerNotice] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setChat(initialChat);
    setChatMessages(initialMessages);
    setHasUploadedData(initialHasUploadedData);
    setActiveDataSourceName(initialActiveDataSourceName);
  }, [
    initialActiveDataSourceName,
    initialChat,
    initialHasUploadedData,
    initialMessages,
  ]);

  useEffect(() => {
    if (!isResponding) {
      inputRef.current?.focus();
    }
  }, [isResponding]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isResponding]);

  useEffect(() => {
    function handleDataUpload() {
      setComposerNotice('');
      setHasUploadedData(true);
    }

    window.addEventListener('datasource-uploaded', handleDataUpload);
    return () =>
      window.removeEventListener('datasource-uploaded', handleDataUpload);
  }, []);

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const userText = inputText.trim();

    if (!userText) {
      return;
    }

    if (!hasUploadedData) {
      setComposerNotice(
        'Pehle Excel ya CSV upload kijiye. Upload ke baad hi query bhej sakte hain.',
      );
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
      const result = await requestApi<SendChatMessageResult>(
        `/api/chats/${chat._id}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text: userText }),
        },
      );

      setChatMessages((prev) => [...prev, result.message]);

      if (result.chatTitle) {
        setChat((prev) => ({
          ...prev,
          company: result.chatTitle || prev.company,
        }));

        window.dispatchEvent(
          new CustomEvent('chat-renamed', {
            detail: {
              chatId: chat._id,
              company: result.chatTitle,
            },
          }),
        );
      }
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
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

  return (
    <div className='flex h-full flex-col'>
      <ChatHeader chat={chat} />
      <ChatMessagesPane
        messages={chatMessages}
        hasUploadedData={hasUploadedData}
        isResponding={isResponding}
        messagesEndRef={messagesEndRef}
      />
      <ChatComposer
        inputRef={inputRef}
        inputText={inputText}
        hasUploadedData={hasUploadedData}
        isResponding={isResponding}
        activeDataSourceName={activeDataSourceName}
        composerNotice={composerNotice}
        onInputChange={setInputText}
        onSubmit={handleSendMessage}
      />
    </div>
  );
}
