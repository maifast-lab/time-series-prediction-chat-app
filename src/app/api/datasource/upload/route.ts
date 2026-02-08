import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import * as xlsx from 'xlsx';

import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import { getBatchEmbeddings } from '@/lib/gemini';
import { logger } from '@/lib/logger';
import DataSource from '@/models/DataSource';
import VectorData, { IVectorData } from '@/models/VectorData';
import TimeSeriesData from '@/models/TimeSeriesData';

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

/**
 * Method: parseMyExcel (Logic from test-method1.cjs)
 * Row 0: Year (sparse, filled backwards), Row 1: Month (sparse, filled backwards), Row 2: Tag
 */
function parseMyExcel(grid: any[][]): ParsedPoint[] {
  const points: ParsedPoint[] = [];

  if (!grid || grid.length < 3) return points;

  // 1. Fill Years (Row 0)
  let year = grid[0][0];
  for (let i = 1; i < grid[0].length; i++) {
    const cell = grid[0][i];
    if (cell && cell !== null && isYear(parseInt(String(cell)))) {
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
  let lastIdx = grid[2].length;
  for (let i = 0; i < grid[2].length; i++) {
    if (
      typeof grid[2][i] === 'string' &&
      ['date', 'day'].includes(String(grid[2][i]).toLowerCase())
    ) {
      lastIdx = i - 1;
      break;
    }
  }

  // 4. Extract Data
  for (let i = 0; i <= lastIdx; i++) {
    const yearVal = grid[0][i];
    const monthVal = grid[1][i];
    const tagVal = grid[2][i];

    if (tagVal == null || tagVal == '') continue;
    const tag = String(tagVal).toUpperCase();

    // Data starts at row 3 (which is index 3)

    for (let j = 3; j < grid.length; j++) {
      const val = grid[j][i];
      if (val == null || val === '') {
        continue;
      }

      // Construct date: j-2 is the day (Row 3 is Day 1)
      const day = j - 2;

      // Basic validation for day
      if (day < 1 || day > 31) continue;

      // Create Date object
      try {
        const date = new Date(Number(yearVal), Number(monthVal) - 1, day);

        // Check if date is valid
        if (!isNaN(date.getTime())) {
          points.push({
            date: date,
            tag: tag,
            value: Number(val),
          });
        }
      } catch (e) {
        // ignore invalid dates
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
function parseDynamicExcel(grid: any[][]): ParsedPoint[] {
  const points: ParsedPoint[] = [];
  if (!grid || grid.length < 2) return points;

  // Function to check if a value is a date-like string or number
  const isDateLike = (val: any): boolean => {
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

    // Vertical Layout: iterate rows
    // Row 0 is headers (Tags)
    // Col `dateColIdx` is Date
    // Other Cols are Values

    for (let i = 1; i < grid.length; i++) {
      const row = grid[i];
      if (!row || row.length <= dateColIdx) continue;

      let dateVal = row[dateColIdx];
      let date: Date | null = null;

      try {
        if (typeof dateVal === 'number') {
          // Excel serial date to JS Date
          date = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
        } else {
          date = new Date(dateVal);
        }
      } catch {
        continue;
      }

      if (!date || isNaN(date.getTime())) continue;

      // Iterate other columns for values
      for (let j = 0; j < row.length; j++) {
        if (j === dateColIdx) continue;

        const tag = String(grid[0][j] || `Col_${j}`).trim();
        const val = row[j];

        if (val !== null && val !== '' && !isNaN(Number(val))) {
          points.push({
            date: date,
            tag: isNaN(Number(tag)) ? tag : `Series_${tag}`, // Avoid numeric tags if possible
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

    // Clean up old data
    const existingDataSources = await DataSource.find({
      userId: session.user.dbId,
    });
    const dataSourceIds = existingDataSources.map((ds) => ds._id);
    if (dataSourceIds.length > 0) {
      await VectorData.deleteMany({ dataSourceId: { $in: dataSourceIds } });
      await DataSource.deleteMany({ userId: session.user.dbId });
      await TimeSeriesData.deleteMany({ userId: session.user.dbId }); // Also clean TS data
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let allPoints: ParsedPoint[] = [];

    // Parse Excel
    if (file.name.match(/\.(xlsx|xls|csv)$/)) {
      const workbook = xlsx.read(buffer, { type: 'buffer' });

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet, {
          header: 1,
          defval: null,
        }) as any[][];

        const points = parseMyExcel(data);

        if (points.length > 0) {
          allPoints = allPoints.concat(points);
        } else {
          // Fallback to Dynamic Parser
          const dynamicPoints = parseDynamicExcel(data);
          if (dynamicPoints.length > 0) {
            logger.info(
              `Fallback to Dynamic Parser success: ${dynamicPoints.length} points`,
            );
            allPoints = allPoints.concat(dynamicPoints);
          }
        }
      }
    }

    if (allPoints.length === 0) {
      return NextResponse.json(
        { error: 'Could not parse time-series data from any known format' },
        { status: 400 },
      );
    }

    const dataSource = await DataSource.create({
      userId: session.user.dbId,
      name: file.name,
      sourceType: 'time-series',
      data: [], // Don't store huge raw data in DataSource anymore
      schemaSummary: `Parsed ${allPoints.length} points. Tags: ${[...new Set(allPoints.map((p) => p.tag))].join(', ')}`,
    });

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
    const tags = [...new Set(allPoints.map((p) => p.tag))];
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
        dataSourceId: dataSource._id as mongoose.Types.ObjectId,
        content: summary,
        embedding: embedding,
      });
    }

    if (vectorDocs.length > 0) {
      await VectorData.insertMany(vectorDocs);
    }

    return NextResponse.json({
      message: 'Success',
      points: allPoints.length,
      tags: tags.length,
    });
  } catch (e) {
    logger.error('Upload failed', e);
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
