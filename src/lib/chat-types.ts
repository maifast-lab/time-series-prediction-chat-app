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
