'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import { Sparkles, Loader2, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';

interface ChatDetails {
  _id: string;
  company: string;
  place: string;
}
interface Message {
  _id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export default function ChatPage() {
  const { id } = useParams();
  const [chat, setChat] = useState<ChatDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [isResponding, setIsResponding] = useState(false);
  const [hasGlobalData, setHasGlobalData] = useState(false);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasAnyData = hasGlobalData;

  useEffect(() => {
    if (!isResponding && !loading) {
      inputRef.current?.focus();
    }
  }, [isResponding, loading]);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/chat/${id}`);
        if (res.ok) {
          const data = await res.json();
          setChat(data.chat);
          setHasGlobalData(data.hasGlobalData);
        }
      } catch (e) {
        logger.error('Failed to fetch data', e);
      }
    }

    async function fetchMessages() {
      try {
        const res = await fetch(`/api/chat/${id}/messages`);
        if (res.ok) {
          setChatMessages(await res.json());
        }
        setLoading(false);
      } catch (e) {
        logger.error('Failed to fetch messages', e);
      }
    }

    fetchData();
    fetchMessages();
  }, [id]);

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  async function fetchData() {
    try {
      const res = await fetch(`/api/chat/${id}`);
      if (res.ok) {
        const data = await res.json();
        setChat(data.chat);
        setHasGlobalData(data.hasGlobalData);
      }
    } catch (e) {
      logger.error('Failed to fetch data', e);
    }
  }

  async function fetchMessages() {
    try {
      const res = await fetch(`/api/chat/${id}/messages`);
      if (res.ok) {
        setChatMessages(await res.json());
      }
      setLoading(false);
    } catch {
      logger.error('Failed to fetch messages');
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    const userText = inputText;
    setInputText('');
    setIsResponding(true);

    const userMsg: Message = {
      _id: `temp-${Date.now()}`,
      role: 'user',
      content: userText,
      createdAt: new Date().toISOString(),
    };
    setChatMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch(`/api/chat/${id}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userText }),
      });

      if (res.ok) {
        const newMessage = await res.json();
        setChatMessages((prev) => [...prev, newMessage]);
      } else {
        const errorData = await res.json().catch(() => ({}));
        logger.error('API Error', errorData);
        setChatMessages((prev) => [
          ...prev,
          {
            _id: `err-${Date.now()}`,
            role: 'assistant',
            content: `Sorry, I encountered an error: ${
              errorData.error || 'Unknown failure'
            }. Please try again.`,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      logger.error('Send Error', err);
      setChatMessages((prev) => [
        ...prev,
        {
          _id: `err-${Date.now()}`,
          role: 'assistant',
          content: 'Network error. Please check your connection and try again.',
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsResponding(false);
    }
  }

  if (loading)
    return (
      <MainLayout>
        <div className='flex-1 flex items-center justify-center'>
          <Loader2 className='w-8 h-8 text-blue-500 animate-spin' />
        </div>
      </MainLayout>
    );

  return (
    <MainLayout>
      <div className='flex flex-col h-full'>
        <header className='px-6 py-4 border-b border-white/5 bg-black/20 backdrop-blur-md flex items-center justify-between z-10'>
          <div>
            <h1 className='text-xl font-bold text-white'>{chat?.company}</h1>
            <div className='flex items-center gap-2 text-sm text-gray-500'>
              <span className='bg-white/5 px-2 py-0.5 rounded text-xs'>
                {chat?.place}
              </span>
            </div>
          </div>
        </header>

        <div className='flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar'>
          <AnimatePresence>
            {chatMessages.length === 0 && !hasAnyData && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className='max-w-md mx-auto mt-20 p-8 rounded-3xl bg-blue-500/5 border border-blue-500/10 text-center'
              >
                <div className='w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6'>
                  <Lock className='w-8 h-8 text-blue-400' />
                </div>
                <h2 className='text-lg font-bold text-white mb-2'>
                  Ready for your data
                </h2>
                <p className='text-sm text-gray-500 mb-6'>
                  Upload a document in the sidebar to give me some context, or
                  just start chatting!
                </p>
              </motion.div>
            )}

            {chatMessages.map((msg) => (
              <motion.div
                key={msg._id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'flex flex-col max-w-[80%]',
                  msg.role === 'user'
                    ? 'ml-auto items-end'
                    : 'mr-auto items-start',
                )}
              >
                <div className='text-[10px] text-gray-500 mb-1 px-2 uppercase tracking-tighter'>
                  {msg.role}
                </div>
                <div
                  className={cn(
                    'p-4 rounded-2xl text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-none'
                      : 'bg-white/5 border border-white/10 text-gray-200 rounded-tl-none',
                  )}
                >
                  {msg.content}
                </div>
                <div className='text-[10px] text-gray-600 mt-1 px-2'>
                  {format(new Date(msg.createdAt), 'HH:mm')}
                </div>
              </motion.div>
            ))}
            <div ref={messagesEndRef} />
          </AnimatePresence>
        </div>

        <div className='p-4 bg-gradient-to-t from-black/80 to-transparent'>
          <form
            onSubmit={handleSendMessage}
            className='max-w-4xl mx-auto relative group'
          >
            <input
              ref={inputRef}
              type='text'
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isResponding}
              placeholder={
                hasAnyData
                  ? 'Ask me anything about your data...'
                  : 'Chat with Maifast...'
              }
              className='w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-6 pr-14 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all backdrop-blur-xl'
            />
            <button
              type='submit'
              disabled={!inputText.trim() || isResponding}
              className='absolute right-2 top-2 p-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-all disabled:opacity-0 disabled:pointer-events-none'
            >
              <Sparkles className='w-4 h-4' />
            </button>
          </form>
        </div>
      </div>
    </MainLayout>
  );
}
