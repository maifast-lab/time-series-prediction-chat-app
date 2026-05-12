export interface ChatSummary {
  _id: string;
  company: string;
  place: string;
  createdAt: string;
}

export interface ChatDetails {
  _id: string;
  company: string;
  place: string;
}

export interface ChatMessage {
  _id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface ChatPageData {
  chat: ChatDetails;
  messages: ChatMessage[];
  hasUploadedData: boolean;
  activeDataSourceName: string;
}

export interface ChatsOverviewData {
  chats: ChatSummary[];
  latestChatId: string | null;
}

export interface SendChatMessageResult {
  message: ChatMessage;
  chatTitle: string | null;
}

export interface LatestChatLookupResponse {
  hasChat: boolean;
  chatId: string | null;
  message: string;
}

export interface UploadDataSourceResult {
  message: string;
  chatId: string | null;
  dataSourceId: string;
  fileName: string;
  points: number;
  tags: number;
  sheetJsonPreview: unknown;
}
