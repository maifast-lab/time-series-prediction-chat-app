import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Chat from "@/models/Chat";
import Message from "@/models/Message";
import TimeSeriesData from "@/models/TimeSeriesData";
import { resolveChatDataSource } from "@/lib/chat-data-source";
import { logger } from "@/lib/logger";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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

function extractNumericSequence(text: string): number[] {
  return Array.from(text.matchAll(/-?\d+(?:\.\d+)?/g))
    .map((match) => Number(match[0]))
    .filter((value) => Number.isFinite(value));
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

function isReadableYearMonthData(
  data: unknown,
): data is ReadableYearMonthData {
  if (!isRecord(data)) {
    return false;
  }

  return Object.entries(data).some(([year, months]) => {
    if (!/^\d{4}$/.test(year) || !isRecord(months)) {
      return false;
    }

    return Object.entries(months).some(([month, seriesList]) => {
      if (!MONTH_KEY_TO_NUMBER[month.toLowerCase()] || !Array.isArray(seriesList)) {
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
  }).format(date).toLowerCase();

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

function getCellValueByRow(points: NumberedPoint[]): Map<number, NumberedPoint> {
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
    const growingMatch = fixedMatch ? null : findGrowingGapMatch(tagPoints, sequence);
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
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(8)));
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
  }).format(date).toLowerCase();
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

  return [`Ye pattern ${visibleMatches.length} jgh mila hai :`, ...lines].join("\n");
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

    if (!activeDataSource) {
      return NextResponse.json(
        { error: "Upload Excel or CSV before sending a query." },
        { status: 400 },
      );
    }

    await Message.create({
      chatId: chat._id,
      role: "user",
      content: userText,
    });

    const querySequence = extractNumericSequence(userText);
    const isRowGridSource =
      activeDataSource.schemaSummary?.includes(
        "Row-based numeric grid detected without real dates",
      ) || false;
    const readableData =
      !isRowGridSource && isReadableYearMonthData(activeDataSource.data)
        ? activeDataSource.data
        : null;
    let patternMatches: PatternMatch[] = [];

    if (querySequence.length === 4) {
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
    }
    const finalResponse =
      querySequence.length === 4
        ? buildPatternAnswer(patternMatches, {
            isRowGridSource,
          })
        : "Exactly 4 numbers provide karo";
    const type = "text";
    const metadata = {
      provider: "deterministic-pattern-matcher",
      uploadedFile: activeDataSource.name,
      querySequence,
    };

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
