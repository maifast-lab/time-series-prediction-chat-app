import 'server-only';

import mongoose from 'mongoose';
import * as xlsx from 'xlsx';

import { buildUploadCleanupFilter } from '@/lib/chat-data-source';
import dbConnect from '@/lib/db';
import { getBatchEmbeddings } from '@/lib/gemini';
import { logger } from '@/lib/logger';
import { buildSheetJson } from '@/lib/time-series';
import Chat from '@/models/Chat';
import DataSource from '@/models/DataSource';
import TimeSeriesData from '@/models/TimeSeriesData';
import VectorData, { type IVectorData } from '@/models/VectorData';

import { requireCurrentUserDbId } from './auth';
import { NotFoundError, ValidationError } from './errors';

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

function isYear(value: unknown): value is number {
  return typeof value === 'number' && value >= 1900 && value <= 2100;
}

function isMonth(value: unknown) {
  if (typeof value !== 'string') {
    return false;
  }

  return MONTH_MAP[value.toUpperCase()] !== undefined;
}

function getMonthNumber(value: string) {
  return MONTH_MAP[value.toUpperCase()] || 1;
}

function getMonthKey(monthIndex: number) {
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
        if (!tagMap) {
          return;
        }

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

function normalizeBaseTag(value: unknown, fallbackTag: string) {
  const trimmed = String(value ?? '').trim();

  if (!trimmed) {
    return fallbackTag;
  }

  return Number.isNaN(Number(trimmed)) ? trimmed.toUpperCase() : `Series_${trimmed}`;
}

function buildUniqueColumnTags(values: unknown[], fallbackPrefix: string) {
  const seenTags = new Map<string, number>();

  return values.map((value, index) => {
    const baseTag = normalizeBaseTag(value, `${fallbackPrefix}_${index + 1}`);
    const nextCount = (seenTags.get(baseTag) || 0) + 1;
    seenTags.set(baseTag, nextCount);

    return nextCount === 1 ? baseTag : `${baseTag}_${nextCount}`;
  });
}

function buildMonthGridColumnTags(grid: unknown[][], lastColumnIndex: number) {
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

function isNumericValue(value: unknown) {
  if (value === null || value === '') {
    return false;
  }

  return Number.isFinite(Number(value));
}

function looksLikeMonthHeaderSheet(grid: unknown[][]) {
  if (!grid || grid.length < 4) {
    return false;
  }

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

function parseNumericGrid(grid: unknown[][]) {
  const points: ParsedPoint[] = [];

  if (!grid || grid.length < 2) {
    return points;
  }

  const maxCols = Math.max(...grid.map((row) => row?.length || 0), 0);
  if (maxCols === 0) {
    return points;
  }

  const firstRow = grid[0] || [];
  const populatedHeaderCells = firstRow.filter((cell) => cell !== null && cell !== '');
  const nonNumericHeaderCells = populatedHeaderCells.filter(
    (cell) =>
      typeof cell === 'string' &&
      cell.trim() !== '' &&
      Number.isNaN(Number(cell)),
  ).length;
  const hasHeaderRow =
    populatedHeaderCells.length > 0 &&
    nonNumericHeaderCells >= Math.ceil(populatedHeaderCells.length / 2);
  const dataStartRow = hasHeaderRow ? 1 : 0;

  let nonEmptyCells = 0;
  let numericCells = 0;

  for (let rowIndex = dataStartRow; rowIndex < grid.length; rowIndex += 1) {
    for (let colIndex = 0; colIndex < maxCols; colIndex += 1) {
      const cell = grid[rowIndex]?.[colIndex];
      if (cell === null || cell === '') {
        continue;
      }

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
    : Array.from({ length: maxCols }, (_, index) => `Series_${index + 1}`);

  for (let colIndex = 0; colIndex < maxCols; colIndex += 1) {
    for (let rowIndex = dataStartRow; rowIndex < grid.length; rowIndex += 1) {
      const cell = grid[rowIndex]?.[colIndex];
      if (!isNumericValue(cell)) {
        continue;
      }

      const rowNumber = rowIndex - dataStartRow + 1;
      points.push({
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

function parseMyExcel(grid: unknown[][]) {
  const points: ParsedPoint[] = [];

  if (!grid || grid.length < 3) {
    return points;
  }

  let year = grid[0][0];
  for (let index = 1; index < grid[0].length; index += 1) {
    const cell = grid[0][index];
    if (cell && cell !== null && isYear(parseInt(String(cell), 10))) {
      year = cell;
      let previousIndex = index - 1;
      while (
        previousIndex >= 0 &&
        (grid[0][previousIndex] == null || grid[0][previousIndex] === '')
      ) {
        grid[0][previousIndex] = year;
        previousIndex -= 1;
      }
    } else {
      grid[0][index] = year;
    }
  }

  let month = getMonthNumber(String(grid[1][0] || ''));
  grid[1][0] = month;
  for (let index = 1; index < grid[1].length; index += 1) {
    const cell = grid[1][index];
    if (cell && cell !== null && isMonth(String(cell).toUpperCase())) {
      month = getMonthNumber(String(cell).toUpperCase());
      grid[1][index] = month;
      let previousIndex = index - 1;
      while (
        previousIndex >= 0 &&
        (grid[1][previousIndex] == null || grid[1][previousIndex] === '')
      ) {
        grid[1][previousIndex] = month;
        previousIndex -= 1;
      }
    } else {
      grid[1][index] = month;
    }
  }

  let lastColumnIndex = grid[2].length - 1;
  for (let index = 0; index < grid[2].length; index += 1) {
    if (
      typeof grid[2][index] === 'string' &&
      ['date', 'day'].includes(String(grid[2][index]).toLowerCase())
    ) {
      lastColumnIndex = index - 1;
      break;
    }
  }

  const tags = buildMonthGridColumnTags(grid, lastColumnIndex);

  for (let columnIndex = 0; columnIndex <= lastColumnIndex; columnIndex += 1) {
    const yearValue = grid[0][columnIndex];
    const monthValue = grid[1][columnIndex];
    const tag = tags[columnIndex];

    for (let rowIndex = 3; rowIndex < grid.length; rowIndex += 1) {
      const value = grid[rowIndex][columnIndex];
      if (!isNumericValue(value)) {
        continue;
      }

      const day = rowIndex - 2;
      if (day < 1 || day > 31) {
        continue;
      }

      try {
        const yearNumber = Number(yearValue);
        const monthNumber = Number(monthValue);
        const date = new Date(Date.UTC(yearNumber, monthNumber - 1, day));

        if (
          !Number.isNaN(date.getTime()) &&
          date.getUTCFullYear() === yearNumber &&
          date.getUTCMonth() === monthNumber - 1 &&
          date.getUTCDate() === day
        ) {
          points.push({
            date,
            tag,
            value: Number(value),
          });
        }
      } catch {
        logger.warn('Skipping invalid date while parsing month-grid sheet');
      }
    }
  }

  if (points.length > 5) {
    logger.info(`Matched parseMyExcel with ${points.length} points`);
  }

  return points;
}

function parseDynamicExcel(grid: unknown[][]) {
  const points: ParsedPoint[] = [];
  if (!grid || grid.length < 2) {
    return points;
  }

  const isDateLike = (value: unknown) => {
    if (value instanceof Date) {
      return true;
    }

    if (typeof value === 'number' && value > 20000 && value < 60000) {
      return true;
    }

    if (
      typeof value === 'string' &&
      value.length > 5 &&
      !Number.isNaN(Date.parse(value))
    ) {
      return true;
    }

    return false;
  };

  let dateColumnIndex = -1;
  let maxDateCount = 0;
  const rowLimit = Math.min(grid.length, 20);
  const columnCount = grid[0]?.length || 0;

  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    let dateCount = 0;
    for (let rowIndex = 1; rowIndex < rowLimit; rowIndex += 1) {
      if (isDateLike(grid[rowIndex]?.[columnIndex])) {
        dateCount += 1;
      }
    }

    if (dateCount > maxDateCount) {
      maxDateCount = dateCount;
      dateColumnIndex = columnIndex;
    }
  }

  if (maxDateCount > (rowLimit - 1) * 0.4) {
    logger.info(
      `Dynamic Parser: Detected Vertical Layout with Date Column at index ${dateColumnIndex}`,
    );

    const columnTags = buildUniqueColumnTags(
      Array.from({ length: columnCount }, (_, index) =>
        index === dateColumnIndex ? null : grid[0]?.[index],
      ),
      'Series',
    );

    for (let rowIndex = 1; rowIndex < grid.length; rowIndex += 1) {
      const row = grid[rowIndex];
      if (!row || row.length <= dateColumnIndex) {
        continue;
      }

      const dateValue = row[dateColumnIndex];
      let date: Date | null = null;

      try {
        if (typeof dateValue === 'number') {
          date = new Date(Math.round((dateValue - 25569) * 86400 * 1000));
        } else if (dateValue instanceof Date) {
          date = new Date(dateValue);
        } else if (typeof dateValue === 'string') {
          date = new Date(dateValue);
        } else {
          continue;
        }
      } catch {
        continue;
      }

      if (!date || Number.isNaN(date.getTime())) {
        continue;
      }

      for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
        if (columnIndex === dateColumnIndex) {
          continue;
        }

        const value = row[columnIndex];
        if (value !== null && value !== '' && !Number.isNaN(Number(value))) {
          points.push({
            date,
            tag: columnTags[columnIndex] || `Series_${columnIndex + 1}`,
            value: Number(value),
          });
        }
      }
    }
  }

  return points;
}

export async function uploadDataSourceForCurrentUser(formData: FormData) {
  const userId = await requireCurrentUserDbId();
  await dbConnect();

  const file = formData.get('file');
  if (!(file instanceof File)) {
    throw new ValidationError('No file uploaded');
  }

  const chatIdValue = formData.get('chatId');
  const chatId =
    typeof chatIdValue === 'string' && mongoose.Types.ObjectId.isValid(chatIdValue)
      ? chatIdValue
      : null;

  let chat:
    | {
        _id: mongoose.Types.ObjectId;
        dataSourceId?: mongoose.Types.ObjectId;
      }
    | null = null;

  if (chatId) {
    chat = await Chat.findOne({
      _id: chatId,
      userId,
      isDeleted: { $ne: true },
    })
      .select('_id dataSourceId')
      .lean();

    if (!chat) {
      throw new NotFoundError('Chat not found');
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let allPoints: ParsedPoint[] = [];
  const parseModes = new Set<string>();

  if (file.name.match(/\.(xlsx|xls|csv)$/i)) {
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
        const monthGridPoints = parseMyExcel(data);
        if (monthGridPoints.length > 0) {
          logger.info(
            `Sheet "${sheetName}" parsed with ${monthGridPoints.length} points using parseMyExcel.`,
          );
          parseModes.add('month-grid');
          allPoints = allPoints.concat(scopePointsToSheet(monthGridPoints));
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
    throw new ValidationError(
      'Could not parse time-series data from any known format',
    );
  }

  const existingDataSources = await DataSource.find(
    buildUploadCleanupFilter(userId, chatId),
  )
    .select('_id')
    .lean();
  const dataSourceIds = new Set(existingDataSources.map((item) => String(item._id)));

  if (chat?.dataSourceId) {
    dataSourceIds.add(String(chat.dataSourceId));
  }

  const dataSourceIdsToDelete = Array.from(dataSourceIds);
  const sheetJsonPreview = buildSheetJson(allPoints, {
    maxPointsPerTag: 25,
  });
  const readableData = buildReadableYearMonthData(allPoints);
  const uniqueTags = [...new Set(allPoints.map((point) => point.tag))];

  const layoutSummary = parseModes.has('row-grid')
    ? 'Row-based numeric grid detected without real dates. Use row positions for pattern answers.'
    : 'Date-based time-series data detected.';
  const schemaSummary = `${layoutSummary} Parsed ${allPoints.length} points across ${uniqueTags.length} tags. Tags: ${uniqueTags.join(', ')}`;

  const dataSource = await DataSource.create({
    userId,
    ...(chat ? { chatId: chat._id } : {}),
    name: file.name,
    sourceType: 'time-series',
    data: readableData,
    schemaSummary,
  });

  const tsDocs = allPoints.map((point) => ({
    userId: new mongoose.Types.ObjectId(userId),
    dataSourceId: dataSource._id as mongoose.Types.ObjectId,
    tag: point.tag,
    date: point.date,
    value: point.value,
  }));

  for (let index = 0; index < tsDocs.length; index += 1000) {
    await TimeSeriesData.insertMany(tsDocs.slice(index, index + 1000));
  }

  const vectorDocs: Partial<IVectorData>[] = [];

  for (const tag of uniqueTags) {
    const tagPoints = allPoints
      .filter((point) => point.tag === tag)
      .sort((left, right) => left.date.getTime() - right.date.getTime());
    const summary = `[TAG: ${tag}] History from ${tagPoints[0].date.toISOString().split('T')[0]} to ${tagPoints[tagPoints.length - 1].date.toISOString().split('T')[0]}. Contains ${tagPoints.length} data points.`;
    const embedding = (await getBatchEmbeddings([summary]))[0];

    vectorDocs.push({
      userId: new mongoose.Types.ObjectId(userId),
      ...(chat ? { chatId: chat._id as mongoose.Types.ObjectId } : {}),
      dataSourceId: dataSource._id as mongoose.Types.ObjectId,
      content: summary,
      embedding,
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
      { _id: chat._id, userId },
      { $set: { dataSourceId: dataSource._id } },
    );
  }

  return {
    message: 'Success',
    chatId,
    dataSourceId: String(dataSource._id),
    fileName: dataSource.name,
    points: allPoints.length,
    tags: uniqueTags.length,
    sheetJsonPreview,
  };
}
