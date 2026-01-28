import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from './logger';
import {
  ChatGoogleGenerativeAI,
  GoogleGenerativeAIEmbeddings,
} from '@langchain/google-genai';

const genAI = new GoogleGenerativeAI(
  process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
);

export const getGeminiModel = (modelName: string = 'gemini-2.5-flash') => {
  try {
    return genAI.getGenerativeModel({ model: modelName });
  } catch (e) {
    logger.warn('Gemini Model load failed', { error: e });
    return genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  }
};

export const getMaifastModel = (modelName: string = 'gemini-2.5-flash') => {
  return new ChatGoogleGenerativeAI({
    model: modelName.includes('2.5') ? 'gemini-2.5-flash' : modelName,
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    temperature: 0,
  });
};

export const getMaifastEmbeddings = () => {
  return new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    model: 'text-embedding-004',
  });
};

export const getEmbeddings = async (text: string) => {
  const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
  const result = await model.embedContent(text);
  return result.embedding.values;
};

export const getBatchEmbeddings = async (texts: string[]) => {
  const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
  const result = await model.batchEmbedContents({
    requests: texts.map((t) => ({
      content: { role: 'user', parts: [{ text: t }] },
    })),
  });
  return result.embeddings.map((e) => e.values);
};
