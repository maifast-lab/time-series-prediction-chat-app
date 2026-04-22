import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as xlsx from 'xlsx';

import { authOptions } from '@/lib/auth';
import { buildUploadCleanupFilter } from '@/lib/chat-data-source';
import dbConnect from '@/lib/db';
import { getBatchEmbeddings } from '@/lib/gemini';
import { logger } from '@/lib/logger';
import { buildSheetJson } from '@/lib/time-series';
import Chat from '@/models/Chat';
import DataSource from '@/models/DataSource';
import VectorData, { IVectorData } from '@/models/VectorData';
import TimeSeriesData from '@/models/TimeSeriesData';

const ENABLE_PARSED_JSON_DUMP = true;

// Month name mappings
const MONTH_MAP: Record<string, number> = {
  JAN: 1,
  JANUARY: 1,
  JANU: 1,
  FEB: 2,
  FEBRUARY: 2,
  FEBR: 2,
  MAR: 3,
  MARCH: 3,
  MARC: 3,
  APR: 4,
  APRIL: 4,
  APRI: 4,
  MAY: 5,
  JUN: 6, 
  JUNE: 6,
  JUL: 7,
  JULY: 7,
  AUG: 8,
  AUGUST: 8,
  AUGU: 8,
  SEP: 9,
  SEPT: 9,
  SEPTEMBER: 9,
  OCT: 10,
  OCTOBER: 10,
  OCTO: 10,
  NOV: 11,
  NOVEMBER: 11,
  NOVE: 11,
  DEC: 12,
  DECEMBER: 12,
  DECE: 12,
};
const MONTH_KEYS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

function isYear(value: unknown): value is number {
  return typeof value === 'number' && value >= 1900 && value <= 2100;
}

function isMonth(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return MONTH_MAP[value.toUpperCase()] !== undefined;
}
function getMonthNumber(value: string): number {
  return MONTH_MAP[value.toUpperCase()] || 1;
}
interface ParsedPoint {
  date: Date;
  tag: string;
  value: number;
}

type ReadableYearMonthData = Record<
  string,
  Record<string, Array<Record<string, number[]>>>
>;
type GroupedReadableData = Map<
  string,
  Map<string, Map<string, Array<{ day: number; value: number }>>>
>;

function getMonthKey(monthIndex: number): string {
  return MONTH_KEYS[monthIndex] || `month_${monthIndex + 1}`;
}

function buildReadableYearMonthData(
  points: ParsedPoint[],
): ReadableYearMonthData {
  const grouped: GroupedReadableData = new Map();

  [...points]
    .filter(
      (point) =>
        point.tag &&
        Number.isFinite(point.value) &&
        !Number.isNaN(point.date.getTime()),
    )
    .sort(
      (left, right) =>
        left.date.getTime() - right.date.getTime() ||
        left.tag.localeCompare(right.tag),
    )
    .forEach((point) => {
      const year = String(point.date.getUTCFullYear());
      const month = getMonthKey(point.date.getUTCMonth());
      const day = point.date.getUTCDate();

      if (!grouped.has(year)) {
        grouped.set(year, new Map());
      }

      const yearBucket = grouped.get(year)!;

      if (!yearBucket.has(month)) {
        yearBucket.set(month, new Map());
      }

      const monthBucket = yearBucket.get(month)!;

      if (!monthBucket.has(point.tag)) {
        monthBucket.set(point.tag, []);
      }

      monthBucket.get(point.tag)!.push({ day, value: point.value });
    });

  return Array.from(grouped.entries())
    .sort(([leftYear], [rightYear]) => Number(leftYear) - Number(rightYear))
    .reduce<ReadableYearMonthData>((yearResult, [year, monthMap]) => {
      yearResult[year] = {};

      MONTH_KEYS.forEach((month) => {
        const tagMap = monthMap.get(month);
        if (!tagMap) return;

        yearResult[year][month] = Array.from(tagMap.entries())
          .sort(([leftTag], [rightTag]) => leftTag.localeCompare(rightTag))
          .map(([tag, entries]) => ({
            [tag]: entries
              .sort((left, right) => left.day - right.day)
              .map((entry) => entry.value),
          }));
      });

      return yearResult;
    }, {});
}

async function dumpParsedJsonToPublic(payload: {
  fileName: string;
  parseModes: string[];
  totalPoints: number;
  readableData: ReadableYearMonthData;
  sheetJsonPreview: unknown[];
  schemaSummary: string;
}) {
  const dumpDir = path.join(process.cwd(), 'public', 'parsed-json');
  const safeFileName = payload.fileName.replace(/[^a-zA-Z0-9._-]+/g, '-');
  const dumpFileName = `${Date.now()}-${safeFileName}.json`;
  const dumpPath = path.join(dumpDir, dumpFileName);

  await mkdir(dumpDir, { recursive: true });
  await writeFile(
    dumpPath,
    JSON.stringify(
      {
        fileName: payload.fileName,
        parseModes: payload.parseModes,
        schemaSummary: payload.schemaSummary,
        totalPoints: payload.totalPoints,
        data: payload.readableData,
        sheetJsonPreview: payload.sheetJsonPreview,
      },
      null,
      2,
    ),
    'utf8',
  );

  return {
    dumpFileName,
    publicPath: `/parsed-json/${dumpFileName}`,
  };
}

function normalizeBaseTag(value: unknown, fallbackTag: string): string {
  const trimmed = String(value ?? '').trim();

  if (!trimmed) {
    return fallbackTag;
  }

  return isNaN(Number(trimmed)) ? trimmed.toUpperCase() : `Series_${trimmed}`;
}

function buildUniqueColumnTags(
  values: unknown[],
  fallbackPrefix: string,
): string[] {
  const seenTags = new Map<string, number>();

  return values.map((value, index) => {
    const baseTag = normalizeBaseTag(value, `${fallbackPrefix}_${index + 1}`);
    const nextCount = (seenTags.get(baseTag) || 0) + 1;
    seenTags.set(baseTag, nextCount);

    return nextCount === 1 ? baseTag : `${baseTag}_${nextCount}`;
  });
}

function buildMonthGridColumnTags(
  grid: unknown[][],
  lastColumnIndex: number,
): string[] {
  const seenTagsInPeriod = new Map<string, number>();

  return Array.from({ length: lastColumnIndex + 1 }, (_, index) => {
    const baseTag = normalizeBaseTag(grid[2]?.[index], `Series_${index + 1}`);
    const year = Number(grid[0]?.[index]);
    const month = Number(grid[1]?.[index]);
    const periodTagKey = `${Number.isFinite(year) ? year : 'unknown'}-${
      Number.isFinite(month) ? month : 'unknown'
    }-${baseTag}`;
    const nextCount = (seenTagsInPeriod.get(periodTagKey) || 0) + 1;
    seenTagsInPeriod.set(periodTagKey, nextCount);

    return nextCount === 1 ? baseTag : `${baseTag}_${nextCount}`;
  });
}

function isNumericValue(value: unknown): boolean {
  if (value === null || value === '') return false;
  return Number.isFinite(Number(value));
}

function looksLikeMonthHeaderSheet(grid: unknown[][]): boolean {
  if (!grid || grid.length < 4) return false;
  const yearHeaderCount = (grid[0] || []).filter((cell) =>
    isYear(parseInt(String(cell), 10)),
  ).length;
  const monthHeaderCount = (grid[1] || []).filter((cell) => {
    if (typeof cell === 'string') {
      return isMonth(cell.toUpperCase());
    }

    return false;
  }).length;
  const tagHeaderCount = (grid[2] || []).filter(
    (cell) => cell !== null && cell !== '',
  ).length;

  return yearHeaderCount > 0 && monthHeaderCount > 0 && tagHeaderCount > 0;
}

function parseNumericGrid(grid: unknown[][]): ParsedPoint[] {
  const points: ParsedPoint[] = [];

  if (!grid || grid.length < 2) return points;

  const maxCols = Math.max(...grid.map((row) => row?.length || 0), 0);
  if (maxCols === 0) return points;

  const firstRow = grid[0] || [];
  const populatedHeaderCells = firstRow.filter((cell) => cell !== null && cell !== '');
  const nonNumericHeaderCells = populatedHeaderCells.filter(
    (cell) => typeof cell === 'string' && cell.trim() !== '' && isNaN(Number(cell)),
  ).length;
  const hasHeaderRow =
    populatedHeaderCells.length > 0 &&
    nonNumericHeaderCells >= Math.ceil(populatedHeaderCells.length / 2);
  const dataStartRow = hasHeaderRow ? 1 : 0;

  let nonEmptyCells = 0;
  let numericCells = 0;

  for (let rowIndex = dataStartRow; rowIndex < grid.length; rowIndex++) {
    for (let colIndex = 0; colIndex < maxCols; colIndex++) {
      const cell = grid[rowIndex]?.[colIndex];
      if (cell === null || cell === '') continue;
      nonEmptyCells += 1;

      if (isNumericValue(cell)) {
        numericCells += 1;
      }
    }
  }

  if (nonEmptyCells === 0 || numericCells / nonEmptyCells < 0.8) {
    return points;
  }

  const tags = hasHeaderRow
    ? buildUniqueColumnTags(grid[0] || [], 'Series')
    : Array.from({ length: maxCols }, (_, colIndex) => `Series_${colIndex + 1}`);

  for (let colIndex = 0; colIndex < maxCols; colIndex++) {
    for (let rowIndex = dataStartRow; rowIndex < grid.length; rowIndex++) {
      const cell = grid[rowIndex]?.[colIndex];
      if (!isNumericValue(cell)) continue;

      const rowNumber = rowIndex - dataStartRow + 1;
      points.push({
        // Plain numeric sheets do not have real dates. We keep row order via a synthetic date.
        date: new Date(Date.UTC(2000, 0, rowNumber)),
        tag: tags[colIndex],
        value: Number(cell),
      });
    }
  }

  if (points.length > 0) {
    logger.info(`Parsed numeric grid with ${points.length} points`);
  }

  return points;
}

/**
 * Method: parseMyExcel (Logic from test-method1.cjs)
 * Row 0: Year (sparse, filled backwards), Row 1: Month (sparse, filled backwards), Row 2: Tag
 */
function parseMyExcel(grid: unknown[][]): ParsedPoint[] {
  const points: ParsedPoint[] = [];

  if (!grid || grid.length < 3) return points;

  // 1. Fill Years (Row 0)
  let year = grid[0][0];
  for (let i = 1; i < grid[0].length; i++) {
    const cell = grid[0][i];
    if (cell && cell !== null && isYear(parseInt(String(cell), 10))) {
      year = cell;
      let j = i - 1;
      while (j >= 0 && (grid[0][j] == null || grid[0][j] == '')) {
        grid[0][j] = year;
        j--;
      }
    } else {
      grid[0][i] = year;
    }
  }

  // 2. Fill Months (Row 1)
  let month = getMonthNumber(String(grid[1][0] || ''));
  grid[1][0] = month;
  for (let i = 1; i < grid[1].length; i++) {
    const cell = grid[1][i];
    if (cell && cell !== null && isMonth(String(cell).toUpperCase())) {
      month = getMonthNumber(String(cell).toUpperCase());
      grid[1][i] = month;
      let j = i - 1;
      while (j >= 0 && (grid[1][j] == null || grid[1][j] == '')) {
        grid[1][j] = month;
        j--;
      }
    } else {
      grid[1][i] = month;
    }
  }

  // 3. Find last index for tags
  let lastIdx = grid[2].length - 1;
  for (let i = 0; i < grid[2].length; i++) {
    if (
      typeof grid[2][i] === 'string' &&
      ['date', 'day'].includes(String(grid[2][i]).toLowerCase())
    ) {
      lastIdx = i - 1;
      break;
    }
  }

  const tags = buildMonthGridColumnTags(grid, lastIdx);

  // 4. Extract Data
  for (let i = 0; i <= lastIdx; i++) {
    const yearVal = grid[0][i];
    const monthVal = grid[1][i];
    const tag = tags[i];

    // Data starts at row 3 (which is index 3)

    for (let j = 3; j < grid.length; j++) {
      const val = grid[j][i];
      if (!isNumericValue(val)) {
        continue;
      }

      // Construct date: j-2 is the day (Row 3 is Day 1)
      const day = j - 2;

      // Basic validation for day
      if (day < 1 || day > 31) continue;

      try {
        const yearNumber = Number(yearVal);
        const monthNumber = Number(monthVal);
        const date = new Date(Date.UTC(yearNumber, monthNumber - 1, day));

        if (
          !isNaN(date.getTime()) &&
          date.getUTCFullYear() === yearNumber &&
          date.getUTCMonth() === monthNumber - 1 &&
          date.getUTCDate() === day
        ) {
          points.push({
            date: date,
            tag: tag,
            value: Number(val),
          });
        }
      } catch {
        console.warn(`Skipping invalid date for Year: ${yearVal}, Month: ${monthVal}, Day: ${day}`);
      }
    }
  }

  if (points.length > 5)
    logger.info(`Matched parseMyExcel with ${points.length} points`);
  return points;
}

/**
 * Method: parseDynamicExcel (Fallback)
 * Heuristics:
 * 1. Find a column or row that looks like Dates.
 * 2. Treat other columns/rows as Tags.
 */
function parseDynamicExcel(grid: unknown[][]): ParsedPoint[] {
  const points: ParsedPoint[] = [];
  if (!grid || grid.length < 2) return points;

  // Function to check if a value is a date-like string or number
  const isDateLike = (val: unknown): boolean => {
    if (val instanceof Date) return true;
    if (typeof val === 'number' && val > 20000 && val < 60000) return true; // Excel serial dates
    if (typeof val === 'string' && val.length > 5 && !isNaN(Date.parse(val)))
      return true;
    return false;
  };

  // 1. Analyze Columns for Date Pattern
  let dateColIdx = -1;
  let maxDateCount = 0;
  const numRows = Math.min(grid.length, 20); // Check first 20 rows
  const numCols = grid[0]?.length || 0;

  for (let j = 0; j < numCols; j++) {
    let dateCount = 0;
    for (let i = 1; i < numRows; i++) {
      // Skip header row 0
      if (isDateLike(grid[i]?.[j])) dateCount++;
    }
    if (dateCount > maxDateCount) {
      maxDateCount = dateCount;
      dateColIdx = j;
    }
  }

  // Threshold: If > 40% of checked rows have a date in this col, assume it's the Date Col
  if (maxDateCount > (numRows - 1) * 0.4) {
    logger.info(
      `Dynamic Parser: Detected Vertical Layout with Date Column at index ${dateColIdx}`,
    );

    const columnTags = buildUniqueColumnTags(
      Array.from({ length: numCols }, (_, index) =>
        index === dateColIdx ? null : grid[0]?.[index],
      ),
      'Series',
    );

    // Vertical Layout: iterate rows
    // Row 0 is headers (Tags)
    // Col `dateColIdx` is Date
    // Other Cols are Values

    for (let i = 1; i < grid.length; i++) {
      const row = grid[i];
      if (!row || row.length <= dateColIdx) continue;

      const dateVal = row[dateColIdx];
      let date: Date | null = null;

      try {
        if (typeof dateVal === 'number') {
          // Excel serial date to JS Date
          date = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
        } else if (dateVal instanceof Date) {
          date = new Date(dateVal);
        } else if (typeof dateVal === 'string') {
          date = new Date(dateVal);
        } else {
          continue;
        }
      } catch {
        continue;
      }

      if (!date || isNaN(date.getTime())) continue;

      // Iterate other columns for values
      for (let j = 0; j < row.length; j++) {
        if (j === dateColIdx) continue;

        const val = row[j];

        if (val !== null && val !== '' && !isNaN(Number(val))) {
          points.push({
            date: date,
            tag: columnTags[j] || `Series_${j + 1}`,
            value: Number(val),
          });
        }
      }
    }
    return points;
  }

  // 2. Horizontal Layout Check? (Not implemented as complex, falling back to Vertical only for now as it covers 90% of generic CSVs)
  // If no vertical date column found, we could check rows, but let's stick to vertical common format for now.

  return points;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.dbId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await dbConnect();
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file)
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    const chatIdValue = formData.get('chatId');
    const chatId =
      typeof chatIdValue === 'string' && mongoose.Types.ObjectId.isValid(chatIdValue)
        ? chatIdValue
        : null;
    let chat = null;

    if (chatId) {
      chat = await Chat.findOne({
        _id: chatId,
        userId: session.user.dbId,
        isDeleted: { $ne: true },
      }).select('_id dataSourceId');

      if (!chat) {
        return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let allPoints: ParsedPoint[] = [];
    const parseModes = new Set<string>();

    // Parse Excel
    if (file.name.match(/\.(xlsx|xls|csv)$/)) {
      const workbook = xlsx.read(buffer, { type: 'buffer' });

      const shouldPrefixSheetName = workbook.SheetNames.length > 1;

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet, {
          header: 1,
          defval: null,
        }) as unknown[][];
        const scopePointsToSheet = (points: ParsedPoint[]) =>
          shouldPrefixSheetName
            ? points.map((point) => ({
                ...point,
                tag: `${sheetName}::${point.tag}`,
              }))
            : points;
        if (looksLikeMonthHeaderSheet(data)) {
          const points = parseMyExcel(data);
          if (points.length > 0) {
            logger.info(
              `Sheet "${sheetName}" parsed with ${points.length} points using parseMyExcel.`,
            );
            parseModes.add('month-grid');
            allPoints = allPoints.concat(scopePointsToSheet(points));
            continue;
          }
        }

        const dynamicPoints = parseDynamicExcel(data);
        if (dynamicPoints.length > 0) {
          logger.info(
            `Fallback to Dynamic Parser success: ${dynamicPoints.length} points`,
          );
          parseModes.add('dated-table');
          allPoints = allPoints.concat(scopePointsToSheet(dynamicPoints));
          continue;
        }
        const numericGridPoints = parseNumericGrid(data);
        if (numericGridPoints.length > 0) {
          parseModes.add('row-grid');
          allPoints = allPoints.concat(scopePointsToSheet(numericGridPoints));
        }
      }
    }

    if (allPoints.length === 0) {
      return NextResponse.json(
        { error: 'Could not parse time-series data from any known format' },
        { status: 400 },
      );
    }

    // Replace only the datasource for the current chat after the new file parses.
    const existingDataSources = await DataSource.find(
      buildUploadCleanupFilter(session.user.dbId, chatId),
    ).select('_id');
    const dataSourceIds = new Set(existingDataSources.map((ds) => String(ds._id)));
    if (chat?.dataSourceId) {
      dataSourceIds.add(String(chat.dataSourceId));
    }
    const dataSourceIdsToDelete = Array.from(dataSourceIds);
    const sheetJsonPreview = buildSheetJson(allPoints, {
      maxPointsPerTag: 25,
    });
    const readableData = buildReadableYearMonthData(allPoints);
    const uniqueTags = [...new Set(allPoints.map((p) => p.tag))];

    const layoutSummary = parseModes.has('row-grid')
      ? 'Row-based numeric grid detected without real dates. Use row positions for pattern answers.'
      : 'Date-based time-series data detected.';
    const schemaSummary = `${layoutSummary} Parsed ${allPoints.length} points across ${uniqueTags.length} tags. Tags: ${uniqueTags.join(', ')}`;

    const dataSource = await DataSource.create({
      userId: session.user.dbId,
      ...(chat ? { chatId: chat._id } : {}),
      name: file.name,
      sourceType: 'time-series',
      data: readableData,
      schemaSummary,
    });

    // let parsedJsonDump: { dumpFileName: string; publicPath: string } | null = null;

    // Comment this block or set ENABLE_PARSED_JSON_DUMP = false to disable public JSON dumps.
    // if (ENABLE_PARSED_JSON_DUMP) {
    //   parsedJsonDump = await dumpParsedJsonToPublic({
    //     fileName: file.name,
    //     parseModes: Array.from(parseModes),
    //     totalPoints: allPoints.length,
    //     readableData,
    //     sheetJsonPreview,
    //     schemaSummary,
    //   });
    // }

    // Bulk write TimeSeriesData
    const tsDocs = allPoints.map((p) => ({
      userId: new mongoose.Types.ObjectId(session.user.dbId),
      dataSourceId: dataSource._id as mongoose.Types.ObjectId,
      tag: p.tag,
      date: p.date,
      value: p.value,
    }));

    // Insert in chunks of 1000 to be safe
    for (let i = 0; i < tsDocs.length; i += 1000) {
      await TimeSeriesData.insertMany(tsDocs.slice(i, i + 1000));
    }

    // Generate Tag Summaries for Vector Search
    // We still want vector search to find *relevant tags* even if it doesn't return the data points
    const tags = uniqueTags;
    const vectorDocs: Partial<IVectorData>[] = [];

    for (const tag of tags) {
      const tagPoints = allPoints
        .filter((p) => p.tag === tag)
        .sort((a, b) => a.date.getTime() - b.date.getTime());
      const summary = `[TAG: ${tag}] History from ${tagPoints[0].date.toISOString().split('T')[0]} to ${tagPoints[tagPoints.length - 1].date.toISOString().split('T')[0]}. Contains ${tagPoints.length} data points.`;

      // We embed the summary so "Predict FB" matches this document
      const embedding = (await getBatchEmbeddings([summary]))[0];
      vectorDocs.push({
        userId: new mongoose.Types.ObjectId(session.user.dbId),
        ...(chat ? { chatId: chat._id as mongoose.Types.ObjectId } : {}),
        dataSourceId: dataSource._id as mongoose.Types.ObjectId,
        content: summary,
        embedding: embedding,
      });
    }

    if (vectorDocs.length > 0) {
      await VectorData.insertMany(vectorDocs);
    }

    if (dataSourceIdsToDelete.length > 0) {
      await VectorData.deleteMany({
        dataSourceId: { $in: dataSourceIdsToDelete },
      });
      await DataSource.deleteMany({ _id: { $in: dataSourceIdsToDelete } });
      await TimeSeriesData.deleteMany({
        dataSourceId: { $in: dataSourceIdsToDelete },
      });
    }

    if (chat) {
      await Chat.updateOne(
        { _id: chat._id, userId: session.user.dbId },
        { $set: { dataSourceId: dataSource._id } },
      );
    }

    return NextResponse.json({
      message: 'Success',
      chatId,
      dataSourceId: dataSource._id,
      fileName: dataSource.name,
      points: allPoints.length,
      tags: tags.length,
      sheetJsonPreview,
      // parsedJsonDump,
    });
  } catch (e) {
    logger.error('Upload failed', e);
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
