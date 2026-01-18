import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPrediction extends Document {
  chatId: mongoose.Types.ObjectId;
  targetDate: string; // ISO string YYYY-MM-DD
  predictedValue: number;
  algorithmVersion: string;
  basedOnLastDate: string;
  createdAt: Date;
}

const PredictionSchema: Schema = new Schema({
  chatId: { type: Schema.Types.ObjectId, ref: 'Chat', required: true },
  targetDate: { type: String, required: true },
  predictedValue: { type: Number, required: true },
  algorithmVersion: { type: String, required: true },
  basedOnLastDate: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, immutable: true },
});

const Prediction: Model<IPrediction> =
  mongoose.models.Prediction ||
  mongoose.model<IPrediction>('Prediction', PredictionSchema);

export default Prediction;
