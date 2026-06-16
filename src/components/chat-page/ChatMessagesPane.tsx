import ChatMessageItem from "@/components/chat-page/ChatMessageItem";
import ChatThinkingIndicator from "@/components/chat-page/ChatThinkingIndicator";
import EmptyChatState from "@/components/chat-page/EmptyChatState";
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

  return (
    <div className='no-scrollbar flex-1 space-y-4 overflow-y-auto p-4'>
      {messages.length === 0 ? (
        <EmptyChatState key='empty-state' />
      ) : null}

      {messages.map((message, index) => (
        <ChatMessageItem
          key={message._id || `${message.role}-${message.createdAt}-${index}`}
          message={message}
        />
      ))}

      {shouldShowThinking ? <ChatThinkingIndicator key='thinking' /> : null}

      <div key='messages-end' ref={messagesEndRef} />
    </div>
  );
}
