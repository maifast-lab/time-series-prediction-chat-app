'use client';

import {
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type FormEvent,
} from 'react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Lock, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { sendChatMessageAction } from '@/app/actions/chat';
import type { ChatPageData, ChatMessage } from '@/lib/chat-types';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

interface ChatPageClientProps {
  initialChat: ChatPageData['chat'];
  initialMessages: ChatPageData['messages'];
  initialHasUploadedData: ChatPageData['hasUploadedData'];
  initialActiveDataSourceName: ChatPageData['activeDataSourceName'];
}

type MarkdownCodeProps = ComponentPropsWithoutRef<'code'> & {
  inline?: boolean;
};

function normalizePatternMessageForDisplay(content: string) {
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

export default function ChatPageClient({
  initialChat,
  initialMessages,
  initialHasUploadedData,
  initialActiveDataSourceName,
}: ChatPageClientProps) {
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
  }, [initialChat]);

  useEffect(() => {
    setChatMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    setHasUploadedData(initialHasUploadedData);
  }, [initialHasUploadedData]);

  useEffect(() => {
    setActiveDataSourceName(initialActiveDataSourceName);
  }, [initialActiveDataSourceName]);

  useEffect(() => {
    if (!isResponding) {
      inputRef.current?.focus();
    }
  }, [isResponding]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    const handleDataUpload = () => {
      setComposerNotice('');
    };

    window.addEventListener('datasource-uploaded', handleDataUpload);
    return () =>
      window.removeEventListener('datasource-uploaded', handleDataUpload);
  }, []);

  async function handleSendMessage(event: FormEvent) {
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
      const result = await sendChatMessageAction(chat._id, userText);

      if (!result.ok) {
        setComposerNotice(result.error);
        setChatMessages((prev) => [
          ...prev,
          {
            _id: `err-${Date.now()}`,
            role: 'assistant',
            content: `Sorry, I encountered an error: ${result.error}. Please try again.`,
            createdAt: new Date().toISOString(),
          },
        ]);
        return;
      }

      setChatMessages((prev) => [...prev, result.data.message]);
      if (result.data.chatTitle) {
        setChat((prev) => ({
          ...prev,
          company: result.data.chatTitle || prev.company,
        }));
      }
    } catch (error) {
      logger.error('Send message failed', error);
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

  return (
    <div className='flex flex-col h-full'>
      <header className='px-6 py-4 border-b border-slate-200 dark:border-white/5 bg-white/65 dark:bg-black/20 backdrop-blur-md flex items-center justify-between z-10'>
        <div>
          <h1 className='text-xl font-bold text-slate-900 dark:text-white'>
            {chat.company}
          </h1>
          <div className='flex items-center gap-2 text-sm text-slate-500 dark:text-gray-500'>
            <span className='bg-slate-200 dark:bg-white/5 px-2 py-0.5 rounded text-xs'>
              {chat.place}
            </span>
          </div>
        </div>
      </header>

      <div className='flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar'>
        <AnimatePresence>
          {chatMessages.length === 0 && !hasUploadedData && (
            <motion.div
              key='empty-state'
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className='max-w-md mx-auto mt-20 p-8 rounded-3xl bg-white/75 dark:bg-blue-500/5 border border-blue-200 dark:border-blue-500/10 text-center shadow-lg shadow-slate-200/60 dark:shadow-none'
            >
              <div className='w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6'>
                <Lock className='w-8 h-8 text-blue-400' />
              </div>
              <h2 className='text-lg font-bold text-slate-900 dark:text-white mb-2'>
                Upload required
              </h2>
              <p className='text-sm text-slate-500 dark:text-gray-500 mb-6'>
                Sidebar se Excel ya CSV upload kijiye. Upload hone ke baad yahi
                chat refresh ke baad bhi wahi file use karegi.
              </p>
            </motion.div>
          )}

          {chatMessages.map((message, index) => (
            <motion.div
              key={message._id || `msg-${index}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'flex flex-col max-w-[80%]',
                message.role === 'user'
                  ? 'ml-auto items-end'
                  : 'mr-auto items-start',
              )}
            >
              <div className='text-[10px] text-slate-500 dark:text-gray-500 mb-1 px-2 uppercase tracking-tighter'>
                {message.role}
              </div>
              <div
                className={cn(
                  'p-4 rounded-2xl text-sm leading-relaxed',
                  message.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-none'
                    : 'bg-white/75 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-gray-200 rounded-tl-none shadow-sm shadow-slate-200/50 dark:shadow-none',
                )}
              >
                <div className='prose prose-p:leading-relaxed prose-pre:p-0 break-words max-w-none'>
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
                      li: ({ children }) => <li className='mb-1'>{children}</li>,
                      code: ({
                        inline,
                        className,
                        children,
                        ...props
                      }: MarkdownCodeProps) =>
                        !inline ? (
                          <div className='rounded-lg bg-slate-950 border border-slate-900/80 p-3 my-2 overflow-x-auto'>
                            <code
                              className={cn(
                                'font-mono text-sm text-slate-100',
                                className,
                              )}
                              {...props}
                            >
                              {children}
                            </code>
                          </div>
                        ) : (
                          <code
                            className='font-mono text-sm bg-slate-950 px-1.5 py-0.5 rounded text-slate-100'
                            {...props}
                          >
                            {children}
                          </code>
                        ),
                    }}
                  >
                    {normalizePatternMessageForDisplay(message.content)}
                  </ReactMarkdown>
                </div>
              </div>
              <div className='text-[10px] text-slate-400 dark:text-gray-600 mt-1 px-2'>
                {format(new Date(message.createdAt), 'HH:mm')}
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
              <div className='text-[10px] text-slate-500 dark:text-gray-500 mb-1 px-2 uppercase tracking-tighter'>
                Maifast
              </div>
              <div className='bg-white/75 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-300 p-4 rounded-2xl rounded-tl-none text-sm leading-relaxed flex items-center gap-3 shadow-sm shadow-slate-200/50 dark:shadow-none'>
                <Loader2 className='w-4 h-4 animate-spin text-blue-400' />
                <span className='animate-pulse'>Thinking...</span>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </AnimatePresence>
      </div>

      <div className='p-4 bg-gradient-to-t from-slate-100 via-slate-100/90 to-transparent dark:from-black/80 dark:via-black/35 dark:to-transparent'>
        <form
          onSubmit={handleSendMessage}
          className='max-w-4xl mx-auto relative group'
        >
          <input
            ref={inputRef}
            type='text'
            value={inputText}
            onChange={(event) => setInputText(event.target.value)}
            disabled={isResponding || !hasUploadedData}
            placeholder={
              hasUploadedData
                ? 'Sheet ke hisab se apna sawal poochiye...'
                : 'Upload Excel/CSV first to unlock chat...'
            }
            className='w-full bg-white/85 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl py-4 pl-6 pr-14 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all backdrop-blur-xl'
          />
          <button
            type='submit'
            disabled={!inputText.trim() || isResponding || !hasUploadedData}
            className='absolute right-2 top-2 p-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed'
          >
            <Sparkles className='w-4 h-4' />
          </button>
        </form>

        <p className='max-w-4xl mx-auto mt-3 px-1 text-xs text-slate-500 dark:text-gray-500'>
          {composerNotice ||
            (hasUploadedData
              ? activeDataSourceName
                ? `Active Excel: ${activeDataSourceName}. Uploaded sheet ke basis par jawab diya jayega.`
                : 'Uploaded sheet ke basis par jawab diya jayega.'
              : 'Upload ke bina query send nahi hogi. Pehle sidebar se sheet upload kijiye.')}
        </p>
        <p className='max-w-4xl mx-auto mt-3 px-1 text-xs text-center text-slate-500 dark:text-gray-500'>
          AI-generated content may not be accurate.
        </p>
      </div>
    </div>
  );
}
