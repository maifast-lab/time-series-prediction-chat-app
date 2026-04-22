import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from './logger';
import {
  ChatGoogleGenerativeAI,
  GoogleGenerativeAIEmbeddings,
} from '@langchain/google-genai';

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

function readNumericEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function normalizeGeminiModelName(modelName: string): string {
  const normalizedModelName = modelName.trim().replace(/^models\//, '');

  if (!normalizedModelName || normalizedModelName.includes('1.5')) {
    return DEFAULT_GEMINI_MODEL;
  }

  return normalizedModelName;
}

export const GEMINI_TIMEOUT_MS = readNumericEnv('GEMINI_TIMEOUT_MS', 45000);
const DEFAULT_GEMINI_MAX_RETRIES = readNumericEnv('GEMINI_MAX_RETRIES', 1);

export interface GeminiErrorDetails {
  message: string;
  statusCode: number;
  retryAfterMs: number | null;
  isQuotaExceeded: boolean;
  isRetryable: boolean;
}

const genAI = new GoogleGenerativeAI(
  process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
);

export const getGeminiModel = (modelName: string = DEFAULT_GEMINI_MODEL) => {
  try {
    return genAI.getGenerativeModel({ model: normalizeGeminiModelName(modelName) });
  } catch (e) {
    logger.warn('Gemini Model load failed', { error: e });
    return genAI.getGenerativeModel({ model: DEFAULT_GEMINI_MODEL });
  }
};

export const getMaifastModel = (
  modelName: string = DEFAULT_GEMINI_MODEL,
  options: {
    temperature?: number;
    maxRetries?: number;
    maxOutputTokens?: number;
  } = {},
) => {
  return new ChatGoogleGenerativeAI({
    model: normalizeGeminiModelName(modelName),
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    temperature: options.temperature ?? 0.2,
    maxRetries: options.maxRetries ?? DEFAULT_GEMINI_MAX_RETRIES,
    maxOutputTokens: options.maxOutputTokens,
  });
};

export const getMaifastEmbeddings = () => {
  return new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    model: 'gemini-embedding-001',
  });
};

export const getEmbeddings = async (text: string) => {
  const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
  const result = await model.embedContent(text);
  return result.embedding.values;
};

export const getBatchEmbeddings = async (texts: string[]) => {
  const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
  const result = await model.batchEmbedContents({
    requests: texts.map((t) => ({
      content: { role: 'user', parts: [{ text: t }] },
    })),
  });
  return result.embeddings.map((e) => e.values);
};

export const sleep = async (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function getGeminiErrorDetails(error: unknown): GeminiErrorDetails {
  const message = getErrorMessage(error);
  const statusMatch = message.match(/\[(\d{3}) [^\]]+\]/);
  const retryAfterMatch = message.match(/Please retry in ([\d.]+)s/i);
  const statusCode = statusMatch ? Number(statusMatch[1]) : 502;
  const retryAfterMs = retryAfterMatch
    ? Math.max(1000, Math.ceil(Number(retryAfterMatch[1]) * 1000))
    : null;
  const isQuotaExceeded =
    /quota exceeded|current quota|insufficient quota|billing|free.?tier/i.test(
      message,
    );
  const isRateLimited =
    statusCode === 429 || /too many requests|rate limit/i.test(message);
  const isTemporaryFailure =
    [500, 502, 503, 504].includes(statusCode) ||
    /timed? out|timeout|network|socket|fetch failed|unavailable|overloaded/i.test(
      message,
    );

  return {
    message,
    statusCode: isQuotaExceeded ? 429 : statusCode,
    retryAfterMs,
    isQuotaExceeded,
    isRetryable: !isQuotaExceeded && (isRateLimited || isTemporaryFailure),
  };
}
