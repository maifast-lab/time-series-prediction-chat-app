import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDataPoint extends Document {
  chatId: mongoose.Types.ObjectId;
  date: string; // ISO string YYYY-MM-DD
  value: number;
}

const DataPointSchema: Schema = new Schema({
  chatId: { type: Schema.Types.ObjectId, ref: 'Chat', required: true },
  date: { type: String, required: true },
  value: { type: Number, required: true },
});

// Compound index to ensure no duplicate dates for a single chat
DataPointSchema.index({ chatId: 1, date: 1 }, { unique: true });

const DataPoint: Model<IDataPoint> =
  mongoose.models.DataPoint ||
  mongoose.model<IDataPoint>('DataPoint', DataPointSchema);

export default DataPoint;
