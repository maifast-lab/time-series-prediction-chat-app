import mongoose, { Schema, Document } from 'mongoose';

export interface IVectorData extends Document {
  userId: mongoose.Types.ObjectId;
  chatId?: mongoose.Types.ObjectId;
  dataSourceId: mongoose.Types.ObjectId;
  content: string;
  embedding: number[];
  createdAt: Date;
}

const VectorDataSchema = new Schema<IVectorData>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    chatId: { type: Schema.Types.ObjectId, ref: 'Chat' },
    dataSourceId: {
      type: Schema.Types.ObjectId,
      ref: 'DataSource',
      required: true,
    },
    content: { type: String, required: true },
    embedding: { type: [Number], required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'vectordata' },
);

export default mongoose.models.VectorData ||
  mongoose.model<IVectorData>('VectorData', VectorDataSchema);
