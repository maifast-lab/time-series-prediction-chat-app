import VectorData from '@/models/VectorData';
import { getEmbeddings } from './gemini';
import { logger } from './logger';
import mongoose from 'mongoose';

export async function performVectorSearch(
  query: string,
  userId: string,
  limit: number = 5,
) {
  try {
    const queryEmbedding = await getEmbeddings(query);

    const results = await VectorData.aggregate([
      {
        $vectorSearch: {
          index: 'vector_index',
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: 100,
          limit: limit,
          filter: {
            userId: { $eq: new mongoose.Types.ObjectId(userId) },
          },
        },
      },
      {
        $project: {
          _id: 1,
          content: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ]);

    return results;
  } catch (error) {
    logger.error('Vector Search Error', error);
    return [];
  }
}
