import {
  GEMINI_TIMEOUT_MS,
  getGeminiErrorDetails,
  getGeminiModel,
  sleep,
} from "@/lib/gemini";
import { logger } from "@/lib/logger";
import {
  isReadableYearMonthData,
  type ReadableYearMonthData,
  toFiniteNumber,
} from "@/lib/pattern-matcher";

export interface GeminiRouteDecision {
  mode: "pattern" | "chat";
  sequence: number[] | null;
  answer: string;
  reason?: string;
}

export interface UploadedDataContext {
  name?: unknown;
  schemaSummary?: unknown;
  data?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeGeminiSequence(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== 4) {
    return null;
  }

  const sequence = value.map(toFiniteNumber);

  return sequence.every((numberValue): numberValue is number => numberValue !== null)
    ? sequence
    : null;
}

function extractJsonPayload(text: string): string {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return trimmed;
  }

  return trimmed.slice(firstBrace, lastBrace + 1);
}

function parseGeminiRouteDecision(responseText: string): GeminiRouteDecision {
  const parsed = JSON.parse(extractJsonPayload(responseText)) as unknown;
  const payload =
    isRecord(parsed) && isRecord(parsed.decision) ? parsed.decision : parsed;

  if (!isRecord(payload)) {
    throw new Error("Gemini route response was not an object");
  }

  const sequence = normalizeGeminiSequence(payload.sequence);
  const requestedPattern = payload.mode === "pattern";
  const answer =
    typeof payload.answer === "string" ? payload.answer.trim() : "";
  const reason =
    typeof payload.reason === "string" ? payload.reason.trim() : undefined;

  if (requestedPattern && sequence) {
    return {
      mode: "pattern",
      sequence,
      answer: "",
      reason,
    };
  }

  return {
    mode: "chat",
    sequence: null,
    answer:
      answer ||
      "Agar pattern nikalwana hai to exactly 4 numbers bhejo, jaise: 1st 100, second 99, third 98, fourth 97.",
    reason,
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Gemini request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function invokeGeminiWithGuardrails<T>(
  invoke: () => Promise<T>,
  options: { maxAttempts?: number } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await invoke();
    } catch (error) {
      lastError = error;
      const errorDetails = getGeminiErrorDetails(error);

      if (!errorDetails.isRetryable || attempt >= maxAttempts) {
        throw error;
      }

      const waitMs = Math.min(
        errorDetails.retryAfterMs ?? attempt * 1500,
        8000,
      );
      logger.warn("Retrying Gemini request", {
        attempt,
        maxAttempts,
        waitMs,
        statusCode: errorDetails.statusCode,
      });
      await sleep(waitMs);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Gemini invoke failed");
}

export function buildGeminiFallbackMessage(error: unknown): string {
  const details = getGeminiErrorDetails(error);

  if (details.isQuotaExceeded) {
    return "Gemini quota limit hit ho gayi hai. Google AI Studio billing/quota check karo, ya quota reset ke baad try karo.";
  }

  return "Gemini abhi answer nahi de pa raha. Thodi der baad same message phir bhejo.";
}

function buildReadableDataSummary(data: ReadableYearMonthData) {
  const years = Object.keys(data).sort(
    (left, right) => Number(left) - Number(right),
  );
  const tags = new Set<string>();
  const sample: Array<{
    year: string;
    month: string;
    series: Array<{ tag: string; firstValues: number[]; totalValues: number }>;
  }> = [];

  for (const year of years) {
    const months = data[year];

    for (const month of Object.keys(months)) {
      const series = months[month];
      const sampleSeries: Array<{
        tag: string;
        firstValues: number[];
        totalValues: number;
      }> = [];

      for (const seriesEntry of series) {
        for (const [tag, values] of Object.entries(seriesEntry)) {
          tags.add(tag);

          if (sample.length < 6 && sampleSeries.length < 4) {
            sampleSeries.push({
              tag,
              firstValues: values
                .map((value) => toFiniteNumber(value))
                .filter((value): value is number => value !== null)
                .slice(0, 8),
              totalValues: values.length,
            });
          }
        }
      }

      if (sample.length < 6 && sampleSeries.length > 0) {
        sample.push({ year, month, series: sampleSeries });
      }
    }
  }

  return {
    shape: "year-month-tag arrays",
    years,
    tags: Array.from(tags).sort(),
    sample,
  };
}

function stringifyForPrompt(value: unknown, maxChars = 12000): string {
  try {
    const text = JSON.stringify(value, null, 2);
    return text.length > maxChars
      ? `${text.slice(0, maxChars)}\n...truncated`
      : text;
  } catch {
    return "Context could not be serialized.";
  }
}

function buildGeminiDataContext(dataSource: UploadedDataContext | null): string {
  if (!dataSource) {
    return "No uploaded datasource is available for this chat.";
  }

  const data =
    !String(dataSource.schemaSummary ?? "").includes(
      "Row-based numeric grid detected without real dates",
    ) && isReadableYearMonthData(dataSource.data)
      ? buildReadableDataSummary(dataSource.data)
      : dataSource.data;

  return stringifyForPrompt({
    uploadedFile: dataSource.name ?? "unknown",
    uploadedSummary: dataSource.schemaSummary ?? "",
    data,
  });
}

export async function routeMessageWithGemini(options: {
  userText: string;
  dataSource: UploadedDataContext | null;
}): Promise<GeminiRouteDecision> {
  const model = getGeminiModel("gemini-2.5-flash");
  const prompt = [
    "You are a router and assistant inside a time-series Excel analysis app.",
    "You must always return ONLY valid JSON. Do not return markdown, code fences, headings, or explanation outside JSON.",
    "Your JSON schema is:",
    '{"mode":"pattern"|"chat","sequence":[number,number,number,number]|null,"answer":"string","reason":"short string"}',
    "",
    "Routing rules:",
    "- Use mode='pattern' only when the user is asking to find, match, calculate, predict, or get the next value from a numeric pattern AND exactly four usable data values are present.",
    "- For mode='pattern', put the four data values in sequence in the intended order, set answer to an empty string, and do not calculate the pattern result.",
    "- Use mode='chat' for every normal question, greeting, explanation request, or incomplete pattern request.",
    "- For mode='chat', write the final user-facing answer in answer.",
    "- If the user asks for a pattern but does not provide exactly four usable data values, answer in simple Hinglish that they must send exactly 4 numbers. Example: '1st 100, second 99, third 98, fourth 97'.",
    "",
    "Messy pattern input rules:",
    "- Understand ordinal labels like 1st, first, 1 no, second, 2nd, 3rd, third, fourth, 4th.",
    "- Ignore label/count numbers. Example: '1st number is 100, 3rd is 98, second is 99, fourth is 97' means sequence [100,99,98,97].",
    "- Do not treat wording like 'four numbers', 'top 5', 'first 5 matches', or row/date labels as sequence values unless they are clearly one of the four data values.",
    "- If order is explicit through labels, sort by label order. If no labels exist, use the order in the message.",
    "",
    "Answer rules:",
    "- Reply in the same language style as the user. Hinglish is okay when the user writes Hinglish.",
    "- If the user asks about the uploaded file, use the uploaded data context below. Do not invent exact values that are not present in the context.",
    "- For simple non-pattern questions, answer normally.",
    "",
    "Uploaded data context:",
    buildGeminiDataContext(options.dataSource),
    "",
    "User message:",
    options.userText,
  ].join("\n");

  const result = await invokeGeminiWithGuardrails(
    () => withTimeout(model.generateContent(prompt), GEMINI_TIMEOUT_MS),
    { maxAttempts: 2 },
  );
  const text = result.response.text().trim();

  return parseGeminiRouteDecision(text);
}
