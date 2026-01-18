import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEvaluation extends Document {
  predictionId: mongoose.Types.ObjectId;
  actualValue: number;
  error: number;
  absoluteError: number;
  percentageError: number;
  evaluatedAt: Date;
}

const EvaluationSchema: Schema = new Schema({
  predictionId: {
    type: Schema.Types.ObjectId,
    ref: 'Prediction',
    required: true,
    unique: true,
  },
  actualValue: { type: Number, required: true },
  error: { type: Number, required: true },
  absoluteError: { type: Number, required: true },
  percentageError: { type: Number, required: true },
  evaluatedAt: { type: Date, default: Date.now, immutable: true },
});

const Evaluation: Model<IEvaluation> =
  mongoose.models.Evaluation ||
  mongoose.model<IEvaluation>('Evaluation', EvaluationSchema);

export default Evaluation;
