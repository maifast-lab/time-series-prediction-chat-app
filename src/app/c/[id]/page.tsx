'use client';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ComponentPropsWithoutRef,
} from 'react';
import { useParams } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import { Sparkles, Loader2, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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

type MarkdownCodeProps = ComponentPropsWithoutRef<'code'> & {
  inline?: boolean;
};

function normalizePatternMessageForDisplay(content: string): string {
  const trimmed = content.trim().replace(/\r\n?/g, '\n');
  const headerMatch = trimmed.match(/^Ye pattern \d+ jgh mila hai\s*:/i);

  if (!headerMatch) {
    return content;
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

export default function ChatPage() {
  const { id } = useParams();
  const chatId = Array.isArray(id) ? id[0] : id;
  const [chat, setChat] = useState<ChatDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [isResponding, setIsResponding] = useState(false);
  const [hasUploadedData, setHasUploadedData] = useState(false);
  const [activeDataSourceName, setActiveDataSourceName] = useState('');
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [composerNotice, setComposerNotice] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasAnyData = hasUploadedData;

  const refreshChatState = useCallback(async () => {
    if (!chatId) return;
    try {
      const res = await fetch(`/api/chat/${chatId}`);
      if (res.ok) {
        const data = await res.json();
        setChat(data.chat);
        setHasUploadedData(data.hasGlobalData);
        setActiveDataSourceName(data.activeDataSourceName || '');
      }
    } catch (e) {
      logger.error('Failed to fetch data', e);
    }
  }, [chatId]);

  useEffect(() => {
    if (!isResponding && !loading) {
      inputRef.current?.focus();
    }
  }, [isResponding, loading]);

  useEffect(() => {
    if (!chatId) return;

    async function fetchMessages() {
      try {
        const res = await fetch(`/api/chat/${chatId}/messages`);
        if (res.ok) {
          setChatMessages(await res.json());
        }
        setLoading(false);
      } catch (e) {
        logger.error('Failed to fetch messages', e);
      }
    }

    refreshChatState();
    fetchMessages();
  }, [chatId, refreshChatState]);

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  useEffect(() => {
    const handleDataUpload = () => {
      refreshChatState();
      setComposerNotice('');
    };

    window.addEventListener('datasource-uploaded', handleDataUpload);
    return () =>
      window.removeEventListener('datasource-uploaded', handleDataUpload);
  }, [chatId, refreshChatState]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };


  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    const userText = inputText.trim();
    if (!userText) return;
    if (!hasAnyData) {
      setComposerNotice(
        'Pehle Excel ya CSV upload kijiye. Upload ke baad hi query bhej sakte hain.',
      );
      return;
    }

    setComposerNotice('');
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
      const res = await fetch(`/api/chat/${chatId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userText }),
      });

      if (res.ok) {
        const newMessage = await res.json();
        setChatMessages((prev) => [...prev, newMessage]);
        // Refresh chat details if the title was "New Chat" to show the generated title
        if (chat?.company === 'New Chat') {
          refreshChatState();
        }
      } else {
        const errorData = await res.json().catch(() => ({}));
        logger.error('API Error', errorData);
        if (errorData.error) {
          setComposerNotice(errorData.error);
        }
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
                key='empty-state'
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className='max-w-md mx-auto mt-20 p-8 rounded-3xl bg-blue-500/5 border border-blue-500/10 text-center'
              >
                <div className='w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6'>
                  <Lock className='w-8 h-8 text-blue-400' />
                </div>
                <h2 className='text-lg font-bold text-white mb-2'>
                  Upload required
                </h2>
                <p className='text-sm text-gray-500 mb-6'>
                  Sidebar se Excel ya CSV upload kijiye. Upload hone ke baad
                  yahi chat refresh ke baad bhi wahi file use karegi.
                </p>
              </motion.div>
            )}

            {chatMessages.map((msg, index) => (
              <motion.div
                key={msg._id || `msg-${index}`}
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
                  <div className='prose prose-invert prose-p:leading-relaxed prose-pre:p-0 break-words'>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => (
                          <p className='mb-2 last:mb-0 whitespace-pre-wrap'>
                            {children}
                          </p>
                        ),
                        ul: ({ children }) => (
                          <ul className='list-disc ml-4 mb-2'>{children}</ul>
                        ),
                        ol: ({ children }) => (
                          <ol className='list-decimal ml-4 mb-2'>{children}</ol>
                        ),
                        li: ({ children }) => (
                          <li className='mb-1'>{children}</li>
                        ),
                        code: ({
                          inline,
                          className,
                          children,
                          ...props
                        }: MarkdownCodeProps) => {
                          return !inline ? (
                            <div className='rounded-lg bg-black/30 border border-white/10 p-3 my-2 overflow-x-auto'>
                              <code
                                className={cn(
                                  'font-mono text-sm text-gray-200',
                                  className,
                                )}
                                {...props}
                              >
                                {children}
                              </code>
                            </div>
                          ) : (
                            <code
                              className='font-mono text-sm bg-black/30 px-1.5 py-0.5 rounded text-gray-200'
                              {...props}
                            >
                              {children}
                            </code>
                          );
                        },
                      }}
                    >
                      {normalizePatternMessageForDisplay(msg.content)}
                    </ReactMarkdown>
                  </div>
                </div>
                <div className='text-[10px] text-gray-600 mt-1 px-2'>
                  {format(new Date(msg.createdAt), 'HH:mm')}
                </div>
              </motion.div>
            ))}
            {isResponding && (
              <motion.div
                key='thinking'
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className='flex flex-col max-w-[80%] mr-auto items-start'
              >
                <div className='text-[10px] text-gray-500 mb-1 px-2 uppercase tracking-tighter'>
                  Maifast
                </div>
                <div className='bg-white/5 border border-white/10 text-gray-300 p-4 rounded-2xl rounded-tl-none text-sm leading-relaxed flex items-center gap-3'>
                  <Loader2 className='w-4 h-4 animate-spin text-blue-400' />
                  <span className='animate-pulse'>Thinking...</span>
                </div>
              </motion.div>
            )}
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
              disabled={isResponding || !hasAnyData}
              placeholder={
                hasAnyData
                  ? 'Sheet ke hisab se apna sawal poochiye...'
                  : 'Upload Excel/CSV first to unlock chat...'
              }
              className='w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-6 pr-14 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all backdrop-blur-xl'
            />
            <button
              type='submit'
              disabled={!inputText.trim() || isResponding || !hasAnyData}
              className='absolute right-2 top-2 p-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed'
            >
              <Sparkles className='w-4 h-4' />
            </button>
          </form>
          <p className='max-w-4xl mx-auto mt-3 px-1 text-xs text-gray-500'>
            {composerNotice ||
              (hasAnyData
                ? activeDataSourceName
                  ? `Active Excel: ${activeDataSourceName}. Uploaded sheet ke basis par jawab diya jayega.`
                  : 'Uploaded sheet ke basis par jawab diya jayega.'
                : 'Upload ke bina query send nahi hogi. Pehle sidebar se sheet upload kijiye.')}
          </p>
        </div>
      </div>
    </MainLayout>
  );
}
