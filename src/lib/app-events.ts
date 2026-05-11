export const CHAT_RENAMED_EVENT = 'chat-renamed';
export const DATA_SOURCE_UPLOADED_EVENT = 'datasource-uploaded';

export interface ChatRenamedEventDetail {
  chatId: string;
  company: string;
}
