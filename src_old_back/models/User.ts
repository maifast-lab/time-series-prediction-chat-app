import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  name?: string;
  image?: string;
  googleId: string;
  lastLogin: Date;
  createdAt: Date;
}

const UserSchema: Schema = new Schema(
  {
    email: { type: String, required: true, unique: true },
    name: { type: String },
    image: { type: String },
    googleId: { type: String, required: true, unique: true },
    lastLogin: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export default mongoose.models.User ||
  mongoose.model<IUser>('User', UserSchema);
