import mongoose, { Schema, Document } from 'mongoose';

export interface IDataSource extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  sourceType: string;
  data: unknown[];
  schemaSummary?: string;
  createdAt: Date;
}

const DataSourceSchema = new Schema<IDataSource>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    sourceType: { type: String, required: true },
    data: [{ type: Schema.Types.Mixed }],
    schemaSummary: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

if (mongoose.models.DataSource) {
  delete mongoose.models.DataSource;
}

const DataSource = mongoose.model<IDataSource>('DataSource', DataSourceSchema);
export default DataSource;
