import ChatMessageItem from "@/components/chat-page/ChatMessageItem";
import ChatThinkingIndicator from "@/components/chat-page/ChatThinkingIndicator";
import EmptyChatState from "@/components/chat-page/EmptyChatState";
import {
  formatMessageDateDivider,
  getChatDayKey,
  isChatDateToday,
  isSameChatDay,
} from "@/lib/chat-date-format";
import type { ChatMessage } from "@/lib/chat-types";

interface ChatMessagesPaneProps {
  messages: ChatMessage[];
  isResponding: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export default function ChatMessagesPane({
  messages,
  isResponding,
  messagesEndRef,
}: ChatMessagesPaneProps) {
  const lastMessage = messages[messages.length - 1];
  const shouldShowThinking = isResponding && lastMessage?.role !== 'assistant';
  const shouldShowDateSeparators = messages.some(
    (message) => !isChatDateToday(message.createdAt),
  );

  return (
    <div className='no-scrollbar flex-1 space-y-4 overflow-y-auto p-4'>
      {messages.length === 0 ? (
        <EmptyChatState key='empty-state' />
      ) : null}

      {messages.map((message, index) => {
        const previousMessage = messages[index - 1];
        const showDateSeparator =
          shouldShowDateSeparators &&
          (!previousMessage ||
            !isSameChatDay(message.createdAt, previousMessage.createdAt));

        return (
          <div
            key={message._id || `${message.role}-${message.createdAt}-${index}`}
            className='space-y-4'
          >
            {showDateSeparator ? (
              <div
                key={`date-${getChatDayKey(message.createdAt)}-${index}`}
                className='flex items-center justify-center'
              >
                <span className='rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-sm shadow-slate-200/40 dark:border-white/10 dark:bg-white/5 dark:text-gray-400 dark:shadow-none'>
                  {formatMessageDateDivider(message.createdAt)}
                </span>
              </div>
            ) : null}
            <ChatMessageItem message={message} />
          </div>
        );
      })}

      {shouldShowThinking ? <ChatThinkingIndicator key='thinking' /> : null}

      <div key='messages-end' ref={messagesEndRef} />
    </div>
  );
}
