import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IChat extends Document {
  userId: mongoose.Types.ObjectId;
  company: string;
  place: string;
  isDeleted?: boolean;
  createdAt: Date;
}

const ChatSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  company: { type: String, default: 'New Chat' },
  place: { type: String, default: 'General' },
  isDeleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const Chat: Model<IChat> =
  mongoose.models.Chat || mongoose.model<IChat>('Chat', ChatSchema);

export default Chat;
