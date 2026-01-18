import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IChat extends Document {
  company: string;
  place: string;
  frequencyDays?: number; // Nullable initially until first upload determines it
  lastDate?: string; // Stored as ISO string YYYY-MM-DD
  minBound?: number;
  maxBound?: number;
  isDeleted?: boolean;
  createdAt: Date;
}

const ChatSchema: Schema = new Schema({
  company: { type: String, required: true },
  place: { type: String, required: true },
  frequencyDays: { type: Number }, // Set once via application logic
  lastDate: { type: String },
  minBound: { type: Number },
  maxBound: { type: Number },
  isDeleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// Prevent model overwrite in development
const Chat: Model<IChat> =
  mongoose.models.Chat || mongoose.model<IChat>('Chat', ChatSchema);

export default Chat;
