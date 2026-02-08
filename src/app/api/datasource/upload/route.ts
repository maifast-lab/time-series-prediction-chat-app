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
    // Row 3 corresponds to Day 1?
    // In test-method1.cjs:
    // for (let j = 3; j < grid.length; j++) {
    //    data[tag][`${j-2}-${month}-${year}`] = grid[j][i]
    // }
    // if j=3, j-2 = 1. So Row 3 is Day 1.

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
