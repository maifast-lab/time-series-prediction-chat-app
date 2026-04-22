import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Chat from "@/models/Chat";
import Message from "@/models/Message";
import TimeSeriesData from "@/models/TimeSeriesData";
import { resolveChatDataSource } from "@/lib/chat-data-source";
import { logger } from "@/lib/logger";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  GEMINI_TIMEOUT_MS,
  getGeminiErrorDetails,
  getGeminiModel,
  sleep,
} from "@/lib/gemini";

interface HistoryPoint {
  tag: string;
  date: Date;
  value: number;
  label?: string;
}

interface NumberedPoint extends HistoryPoint {
  rowNumber: number;
}

interface PatternMatch {
  tag: string;
  nextRow: number;
  nextPoint: HistoryPoint;
  matchType: "fixed-gap" | "growing-gap" | "decreasing-gap";
}

interface PatternRequestParse {
  isLikelyPatternRequest: boolean;
  sequence: number[] | null;
  extractedNumbers: number[];
}

interface UploadedDataContext {
  name?: unknown;
  schemaSummary?: unknown;
  data?: unknown;
}

type ReadableYearMonthData = Record<
  string,
  Record<string, Array<Record<string, unknown[]>>>
>;

const MONTH_KEY_TO_NUMBER: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const PATTERN_INTENT_REGEX =
  /\b(pattern|patern|patten|sequence|series|match|matching|mila|find|next|prediction|predict|gap|calculate|calc)\b/i;

const POSITION_LABELS: Array<{ index: number; regex: RegExp }> = [
  { index: 0, regex: /\b(?:1\s*(?:st|no\.?|num(?:ber)?)|first|frist)\b/gi },
  {
    index: 1,
    regex:
      /\b(?:2\s*(?:nd|no\.?|num(?:ber)?)|second|secend|secned|secnd|secound)\b/gi,
  },
  { index: 2, regex: /\b(?:3\s*(?:rd|no\.?|num(?:ber)?)|third|thrid)\b/gi },
  { index: 3, regex: /\b(?:4\s*(?:th|no\.?|num(?:ber)?)|fourth|forth)\b/gi },
];

function extractNumbers(text: string): number[] {
  return Array.from(text.matchAll(/-?\d+(?:\.\d+)?/g))
    .map((match) => Number(match[0]))
    .filter((value) => Number.isFinite(value));
}

function stripPatternHelperNumbers(text: string): string {
  let cleaned = text;

  cleaned = cleaned.replace(
    /\b4\s*(?:number|numbers|no|nos|value|values|digit|digits|pattern|patern|patten)\b/gi,
    " ",
  );
  cleaned = cleaned.replace(
    /\bfour\s*(?:number|numbers|no|nos|value|values|digit|digits|pattern|patern|patten)\b/gi,
    " ",
  );
  cleaned = cleaned.replace(/\b(?:top|first|max|maximum|only)\s*5\b/gi, " ");
  cleaned = cleaned.replace(
    /\b(?:five)\s*(?:match|matches|result|results)?\b/gi,
    " ",
  );

  for (const { regex } of POSITION_LABELS) {
    cleaned = cleaned.replace(regex, " ");
  }

  return cleaned;
}

function extractLabeledSequence(text: string): number[] | null {
  const labels: Array<{ index: number; start: number; end: number }> = [];

  for (const { index, regex } of POSITION_LABELS) {
    regex.lastIndex = 0;
    for (const match of text.matchAll(regex)) {
      labels.push({
        index,
        start: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
      });
    }
  }

  if (labels.length === 0) {
    return null;
  }

  labels.sort((left, right) => left.start - right.start);

  const values: Array<number | null> = [null, null, null, null];

  labels.forEach((label, labelIndex) => {
    const nextLabel = labels[labelIndex + 1];
    const segment = text.slice(label.end, nextLabel?.start);
    const numbers = extractNumbers(segment);

    if (numbers.length > 0) {
      values[label.index] = numbers[0];
    }
  });

  return values.every((value): value is number => value !== null)
    ? values
    : null;
}

function parsePatternRequest(text: string): PatternRequestParse {
  const labeledSequence = extractLabeledSequence(text);
  const cleanedNumbers = extractNumbers(stripPatternHelperNumbers(text));
  const sequence =
    labeledSequence ?? (cleanedNumbers.length === 4 ? cleanedNumbers : null);

  return {
    isLikelyPatternRequest:
      PATTERN_INTENT_REGEX.test(text) || sequence !== null,
    sequence,
    extractedNumbers: sequence ?? cleanedNumbers,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const numericValue = Number(value.trim().replace(/,/g, ""));
  return Number.isFinite(numericValue) ? numericValue : null;
}

function isReadableYearMonthData(data: unknown): data is ReadableYearMonthData {
  if (!isRecord(data)) {
    return false;
  }

  return Object.entries(data).some(([year, months]) => {
    if (!/^\d{4}$/.test(year) || !isRecord(months)) {
      return false;
    }

    return Object.entries(months).some(([month, seriesList]) => {
      if (
        !MONTH_KEY_TO_NUMBER[month.toLowerCase()] ||
        !Array.isArray(seriesList)
      ) {
        return false;
      }

      return seriesList.some((series) => {
        if (!isRecord(series)) {
          return false;
        }

        return Object.values(series).some(Array.isArray);
      });
    });
  });
}

function getDateForParts(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateParts(year: number, month: number, day: number): string {
  const date = getDateForParts(year, month, day);

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return `Row ${day}`;
  }

  const monthName = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  })
    .format(date)
    .toLowerCase();

  return `${day} ${monthName} ${year}`;
}

function buildReadableDataHistoryPoints(
  data: ReadableYearMonthData,
): HistoryPoint[] {
  const points: HistoryPoint[] = [];

  for (const [yearKey, months] of Object.entries(data)) {
    const year = Number(yearKey);
    if (!Number.isInteger(year)) {
      continue;
    }

    for (const [monthKey, seriesList] of Object.entries(months)) {
      const month = MONTH_KEY_TO_NUMBER[monthKey.toLowerCase()];
      if (!month || !Array.isArray(seriesList)) {
        continue;
      }

      for (const series of seriesList) {
        if (!isRecord(series)) {
          continue;
        }

        for (const [tag, values] of Object.entries(series)) {
          if (!Array.isArray(values)) {
            continue;
          }

          values.forEach((rawValue, index) => {
            const value = toFiniteNumber(rawValue);
            if (value === null) {
              return;
            }

            const day = index + 1;
            const monthLabel = String(month).padStart(2, "0");

            points.push({
              tag: `${tag}::${year}-${monthLabel}`,
              date: getDateForParts(year, month, day),
              value,
              label: formatDateParts(year, month, day),
            });
          });
        }
      }
    }
  }

  return points;
}

function groupHistoryBySeries(
  points: HistoryPoint[],
  getSeriesKey: (point: HistoryPoint) => string,
): Map<string, NumberedPoint[]> {
  const grouped = new Map<string, HistoryPoint[]>();

  points.forEach((point) => {
    const seriesKey = getSeriesKey(point);

    if (!grouped.has(seriesKey)) {
      grouped.set(seriesKey, []);
    }

    grouped.get(seriesKey)!.push(point);
  });

  return new Map(
    Array.from(grouped.entries()).map(([seriesKey, tagPoints]) => [
      seriesKey,
      tagPoints
        .sort((left, right) => left.date.getTime() - right.date.getTime())
        .map((point, index) => ({
          ...point,
          rowNumber: index + 1,
        })),
    ]),
  );
}

function getCalendarMonthSeriesKey(point: HistoryPoint): string {
  const year = point.date.getUTCFullYear();
  const month = String(point.date.getUTCMonth() + 1).padStart(2, "0");

  return `${point.tag}::${year}-${month}`;
}

function getCellValueByRow(
  points: NumberedPoint[],
): Map<number, NumberedPoint> {
  return new Map(points.map((point) => [point.rowNumber, point]));
}

function findFixedGapMatch(
  points: NumberedPoint[],
  sequence: number[],
): { nextRow: number; nextPoint: NumberedPoint } | null {
  const rowPointMap = getCellValueByRow(points);
  const rows = points.map((point) => point.rowNumber);
  const maxRow = rows[rows.length - 1] ?? 0;

  for (const row1 of rows) {
    if (rowPointMap.get(row1)?.value !== sequence[0]) {
      continue;
    }
    for (let diff = 1; row1 + diff * 4 <= maxRow; diff++) {
      const row2 = row1 + diff;
      const row3 = row2 + diff;
      const row4 = row3 + diff;
      const nextRow = row4 + diff;
      const nextPoint = rowPointMap.get(nextRow);

      if (
        rowPointMap.get(row2)?.value === sequence[1] &&
        rowPointMap.get(row3)?.value === sequence[2] &&
        rowPointMap.get(row4)?.value === sequence[3] &&
        nextPoint
      ) {
        return { nextRow, nextPoint };
      }
    }
  }

  return null;
}

function findGrowingGapMatch(
  points: NumberedPoint[],
  sequence: number[],
): { nextRow: number; nextPoint: NumberedPoint } | null {
  const rowPointMap = getCellValueByRow(points);
  const rows = points.map((point) => point.rowNumber);
  const maxRow = rows[rows.length - 1] ?? 0;

  for (const row1 of rows) {
    if (rowPointMap.get(row1)?.value !== sequence[0]) {
      continue;
    }

    for (let diff = 1; row1 + diff * 4 + 6 <= maxRow; diff++) {
      for (let growth = 1; row1 + diff * 4 + growth * 6 <= maxRow; growth++) {
        const row2 = row1 + diff;
        const row3 = row2 + diff + growth;
        const row4 = row3 + diff + growth * 2;
        const nextRow = row4 + diff + growth * 3;
        const nextPoint = rowPointMap.get(nextRow);

        if (
          rowPointMap.get(row2)?.value === sequence[1] &&
          rowPointMap.get(row3)?.value === sequence[2] &&
          rowPointMap.get(row4)?.value === sequence[3] &&
          nextPoint
        ) {
          return { nextRow, nextPoint };
        }
      }
    }
  }

  return null;
}

function findDecreasingGapMatch(
  points: NumberedPoint[],
  sequence: number[],
): { nextRow: number; nextPoint: NumberedPoint } | null {
  const rowPointMap = getCellValueByRow(points);
  const rows = points.map((point) => point.rowNumber);
  const maxRow = rows[rows.length - 1] ?? 0;

  for (const row1 of rows) {
    if (rowPointMap.get(row1)?.value !== sequence[0]) {
      continue;
    }

    for (let diff = 1; row1 + diff <= maxRow; diff++) {
      const maxDecrease = Math.floor((diff - 1) / 3);

      for (let decrease = maxDecrease; decrease >= 1; decrease--) {
        const diff2 = diff - decrease;
        const diff3 = diff2 - decrease;
        const nextDiff = diff3 - decrease;

        if (nextDiff < 1) {
          continue;
        }

        const row2 = row1 + diff;
        const row3 = row2 + diff2;
        const row4 = row3 + diff3;
        const nextRow = row4 + nextDiff;
        const nextPoint = rowPointMap.get(nextRow);

        if (
          rowPointMap.get(row2)?.value === sequence[1] &&
          rowPointMap.get(row3)?.value === sequence[2] &&
          rowPointMap.get(row4)?.value === sequence[3] &&
          nextPoint
        ) {
          return { nextRow, nextPoint };
        }
      }
    }
  }

  return null;
}

function findPatternMatches(
  historyPoints: HistoryPoint[],
  sequence: number[],
  options: { seriesMode: "tag" | "calendar-month" } = { seriesMode: "tag" },
): PatternMatch[] {
  const matches: PatternMatch[] = [];
  const grouped =
    options.seriesMode === "calendar-month"
      ? groupHistoryBySeries(historyPoints, getCalendarMonthSeriesKey)
      : groupHistoryBySeries(historyPoints, (point) => point.tag);

  for (const [seriesKey, tagPoints] of grouped.entries()) {
    if (tagPoints.length < 5) {
      continue;
    }

    const fixedMatch = findFixedGapMatch(tagPoints, sequence);
    const growingMatch = fixedMatch
      ? null
      : findGrowingGapMatch(tagPoints, sequence);
    const decreasingMatch =
      fixedMatch || growingMatch
        ? null
        : findDecreasingGapMatch(tagPoints, sequence);
    const foundMatch = fixedMatch ?? growingMatch ?? decreasingMatch;

    if (!foundMatch) {
      continue;
    }

    const matchType = fixedMatch
      ? "fixed-gap"
      : growingMatch
        ? "growing-gap"
        : "decreasing-gap";

    matches.push({
      tag: seriesKey,
      nextRow: foundMatch.nextRow,
      nextPoint: foundMatch.nextPoint,
      matchType,
    });
  }

  return matches;
}

function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(8)));
}

function formatPointLabel(
  point: HistoryPoint,
  rowNumber: number,
  isRowGridSource: boolean,
): string {
  if (point.label) {
    return point.label;
  }

  const { date } = point;

  if (
    isRowGridSource ||
    (date.getUTCFullYear() === 2000 && date.getUTCMonth() === 0)
  ) {
    return `Row ${rowNumber}`;
  }

  const day = date.getUTCDate();
  const month = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  })
    .format(date)
    .toLowerCase();
  const year = date.getUTCFullYear();

  return `${day} ${month} ${year}`;
}

function buildPatternAnswer(
  matches: PatternMatch[],
  options: { isRowGridSource: boolean },
): string {
  if (matches.length === 0) {
    return "Ye pattern nhi mila";
  }

  const visibleMatches = [...matches]
    .sort(
      (left, right) =>
        left.nextPoint.date.getTime() - right.nextPoint.date.getTime() ||
        left.tag.localeCompare(right.tag) ||
        left.nextRow - right.nextRow,
    )
    .slice(0, 5);
  const lines = visibleMatches.map((match) => {
    const label = formatPointLabel(
      match.nextPoint,
      match.nextRow,
      options.isRowGridSource,
    );

    return `${label} - ${formatNumber(match.nextPoint.value)}`;
  });

  return [`Ye pattern ${visibleMatches.length} jgh mila hai :`, ...lines].join(
    "\n",
  );
}

function buildChatTitle(text: string): string {
  const words = text
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);

  return words.length > 0 ? words.join(" ") : "New Chat";
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

function buildGeminiFallbackMessage(error: unknown): string {
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

function buildGeminiDataContext(
  dataSource: UploadedDataContext | null,
): string {
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

async function generateGeminiAnswer(options: {
  userText: string;
  dataSource: UploadedDataContext | null;
  patternParse: PatternRequestParse;
}): Promise<string> {
  const model = getGeminiModel("gemini-2.5-flash");
  const prompt = [
    "You are a concise assistant inside a time-series Excel analysis app.",
    "Reply in the same language style as the user. Hinglish is okay when the user writes Hinglish.",
    "If the user asks a normal question, answer normally.",
    "If the user asks about the uploaded file, use the uploaded data context below. Do not invent exact values that are not present in the context.",
    "If the user asks for a four-number pattern/next-value match, do not calculate it yourself. The backend handles that only when exactly four usable data values are present.",
    "If the user is asking for a pattern but did not provide exactly four usable data values, ask them briefly to send exactly four numbers. Mention they can write them in any form like '1st 100, second 99, third 98, fourth 97'.",
    "",
    `Pattern parser info: ${stringifyForPrompt(options.patternParse, 2000)}`,
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

  return (
    text ||
    "Gemini se empty response aaya. Message thoda clear karke phir bhejo."
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.dbId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await dbConnect();
    const { id } = await params;
    const { text } = await req.json();
    const userText = typeof text === "string" ? text.trim() : "";
    if (!userText)
      return NextResponse.json(
        { error: "Message text required" },
        { status: 400 },
      );
    const chat = await Chat.findOne({ _id: id, userId: session.user.dbId });
    if (!chat)
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });

    const activeDataSource = await resolveChatDataSource({
      userId: session.user.dbId,
      chatId: String(chat._id),
      dataSourceId: chat.dataSourceId?.toString(),
    });

    await Message.create({
      chatId: chat._id,
      role: "user",
      content: userText,
    });

    const patternParse = parsePatternRequest(userText);
    const querySequence = patternParse.sequence;
    const isRowGridSource =
      activeDataSource?.schemaSummary?.includes(
        "Row-based numeric grid detected without real dates",
      ) || false;
    const readableData =
      activeDataSource &&
      !isRowGridSource &&
      isReadableYearMonthData(activeDataSource.data)
        ? activeDataSource.data
        : null;
    let patternMatches: PatternMatch[] = [];
    let finalResponse: string;
    const metadata: Record<string, unknown> = {
      uploadedFile: activeDataSource?.name,
      querySequence,
      extractedNumbers: patternParse.extractedNumbers,
      isLikelyPatternRequest: patternParse.isLikelyPatternRequest,
    };

    if (querySequence) {
      metadata.provider = "deterministic-pattern-matcher";

      if (!activeDataSource) {
        finalResponse =
          "Pattern nikalne ke liye pehle Excel ya CSV upload karo.";
      } else {
        if (readableData) {
          patternMatches = findPatternMatches(
            buildReadableDataHistoryPoints(readableData),
            querySequence,
          );
        } else {
          const historyDocs = await TimeSeriesData.find({
            dataSourceId: activeDataSource._id,
          })
            .sort({ tag: 1, date: 1 })
            .select("tag date value -_id");
          const historyPoints: HistoryPoint[] = historyDocs.map((doc) => ({
            tag: doc.tag,
            date: doc.date,
            value: doc.value,
          }));

          patternMatches = findPatternMatches(historyPoints, querySequence);
        }

        finalResponse = buildPatternAnswer(patternMatches, {
          isRowGridSource,
        });
      }
    } else {
      metadata.provider = "gemini";

      try {
        finalResponse = await generateGeminiAnswer({
          userText,
          dataSource: activeDataSource,
          patternParse,
        });
      } catch (geminiError) {
        const errorDetails = getGeminiErrorDetails(geminiError);
        logger.error(
          "Gemini message generation failed",
          geminiError,
          errorDetails,
        );
        metadata.providerError = true;
        metadata.statusCode = errorDetails.statusCode;
        metadata.retryAfterMs = errorDetails.retryAfterMs;
        metadata.isQuotaExceeded = errorDetails.isQuotaExceeded;
        finalResponse = buildGeminiFallbackMessage(geminiError);
      }
    }
    const type = "text";

    const assistantMsg = await Message.create({
      chatId: chat._id,
      role: "assistant",
      content: finalResponse,
      type,
      metadata,
    });

    if (chat.company === "New Chat") {
      await Chat.findByIdAndUpdate(chat._id, {
        company: buildChatTitle(userText),
      });
    }

    return NextResponse.json(assistantMsg);
  } catch (error: unknown) {
    logger.error("Message Error", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
