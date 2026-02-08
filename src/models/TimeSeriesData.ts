import mongoose, { Schema, Document } from 'mongoose';

export interface ITimeSeriesData extends Document {
  userId: mongoose.Types.ObjectId;
  dataSourceId: mongoose.Types.ObjectId;
  tag: string;
  date: Date;
  value: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const TimeSeriesDataSchema = new Schema<ITimeSeriesData>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    dataSourceId: {
      type: Schema.Types.ObjectId,
      ref: 'DataSource',
      required: true,
    },
    tag: { type: String, required: true, index: true },
    date: { type: Date, required: true, index: true },
    value: { type: Number, required: true },
    metadata: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'timeseriesdata' },
);

// Compound index for efficient lookup of a tag's history for a user
TimeSeriesDataSchema.index({ userId: 1, tag: 1, date: 1 });

export default mongoose.models.TimeSeriesData ||
  mongoose.model<ITimeSeriesData>('TimeSeriesData', TimeSeriesDataSchema);
