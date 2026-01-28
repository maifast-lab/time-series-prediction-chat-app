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

// Month name mappings
const MONTH_MAP: Record<string, number> = {
  JAN: 1,
  JANUARY: 1,
  FEB: 2,
  FEBRUARY: 2,
  MAR: 3,
  MARCH: 3,
  APR: 4,
  APRIL: 4,
  MAY: 5,
  JUN: 6,
  JUNE: 6,
  JUL: 7,
  JULY: 7,
  AUG: 8,
  AUGUST: 8,
  SEP: 9,
  SEPT: 9,
  SEPTEMBER: 9,
  OCT: 10,
  OCTOBER: 10,
  NOV: 11,
  NOVEMBER: 11,
  DEC: 12,
  DECEMBER: 12,
};

interface TimeSeriesPoint {
  date: string; // YYYY-MM format
  tag: string;
  value: number;
  rowIndex: number;
}

/**
 * Detects if a cell value is a year (4-digit number between 1900-2100)
 */
function isYear(value: unknown): value is number {
  return typeof value === 'number' && value >= 1900 && value <= 2100;
}

/**
 * Detects if a cell value is a month name
 */
function isMonth(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return MONTH_MAP[value.toUpperCase()] !== undefined;
}

/**
 * Gets month number from month name
 */
function getMonthNumber(value: string): number {
  return MONTH_MAP[value.toUpperCase()] || 0;
}

/**
 * Parses time-series data from Excel with flexible year/month/tag structure
 * Returns normalized data points with date, tag, and value
 */
function parseTimeSeriesData(rawData: unknown[][]): {
  points: TimeSeriesPoint[];
  tags: string[];
  dateRange: { start: string; end: string };
  schema: string;
} {
  if (rawData.length < 4) {
    return {
      points: [],
      tags: [],
      dateRange: { start: '', end: '' },
      schema: '',
    };
  }

  const points: TimeSeriesPoint[] = [];
  const tagsSet = new Set<string>();
  const datesSet = new Set<string>();

  // Analyze first few rows to find year, month, and tag rows
  let yearRow = -1;
  let monthRow = -1;
  let tagRow = -1;
  let dataStartRow = -1;

  for (let i = 0; i < Math.min(5, rawData.length); i++) {
    const row = rawData[i];
    if (!row) continue;

    // Check for year row (contains a 4-digit year)
    if (yearRow === -1 && row.some(isYear)) {
      yearRow = i;
      continue;
    }

    // Check for month row (contains month names)
    if (monthRow === -1 && row.some(isMonth)) {
      monthRow = i;
      continue;
    }

    // Check for tag row (contains short text codes, not months/years)
    if (tagRow === -1 && monthRow !== -1) {
      const hasShortCodes =
        row.filter((v) => typeof v === 'string' && v.length <= 5 && !isMonth(v))
          .length > 3;
      if (hasShortCodes) {
        tagRow = i;
        dataStartRow = i + 1;
        break;
      }
    }
  }

  // If we couldn't detect structure, fall back to generic parsing
  if (yearRow === -1 || monthRow === -1 || tagRow === -1) {
    logger.warn(
      'Could not detect time-series structure, using fallback parsing',
    );
    return {
      points: [],
      tags: [],
      dateRange: { start: '', end: '' },
      schema: 'Generic data - no time-series structure detected',
    };
  }

  const yearRowData = rawData[yearRow];
  const monthRowData = rawData[monthRow];
  const tagRowData = rawData[tagRow];

  // Build column mapping: columnIndex -> { year, month, tag }
  const columnMap: Map<number, { year: number; month: number; tag: string }> =
    new Map();

  let currentYear = 0;
  let currentMonth = 0;

  for (let col = 0; col < tagRowData.length; col++) {
    // Update year if present in this column
    if (yearRowData[col] && isYear(yearRowData[col])) {
      currentYear = yearRowData[col] as number;
    }

    // Update month if present in this column
    if (monthRowData[col] && isMonth(monthRowData[col])) {
      currentMonth = getMonthNumber(monthRowData[col] as string);
    }

    // Get tag for this column
    const tag = tagRowData[col];
    if (typeof tag === 'string' && tag.trim() && currentYear && currentMonth) {
      columnMap.set(col, {
        year: currentYear,
        month: currentMonth,
        tag: tag.trim().toUpperCase(),
      });
      tagsSet.add(tag.trim().toUpperCase());
    }
  }

  // Parse data rows
  for (let rowIdx = dataStartRow; rowIdx < rawData.length; rowIdx++) {
    const row = rawData[rowIdx];
    if (!row) continue;

    for (let col = 0; col < row.length; col++) {
      const value = row[col];
      const mapping = columnMap.get(col);

      if (mapping && typeof value === 'number' && !isNaN(value)) {
        const dateStr = `${mapping.year}-${String(mapping.month).padStart(2, '0')}`;
        datesSet.add(dateStr);

        points.push({
          date: dateStr,
          tag: mapping.tag,
          value: value,
          rowIndex: rowIdx - dataStartRow + 1,
        });
      }
    }
  }

  // Sort dates to get range
  const sortedDates = [...datesSet].sort();

  // Generate schema summary
  const tags = [...tagsSet].sort();
  const schema = `Time-series data with ${tags.length} tags (${tags.join(', ')}) from ${sortedDates[0] || 'N/A'} to ${sortedDates[sortedDates.length - 1] || 'N/A'}. Total data points: ${points.length}`;

  return {
    points,
    tags,
    dateRange: {
      start: sortedDates[0] || '',
      end: sortedDates[sortedDates.length - 1] || '',
    },
    schema,
  };
}

/**
 * Groups time-series data by tag for embedding
 * Each tag gets a comprehensive text representation of its time-series
 */
function createTagEmbeddings(
  points: TimeSeriesPoint[],
  tags: string[],
): string[] {
  const embeddings: string[] = [];

  for (const tag of tags) {
    const tagPoints = points.filter((p) => p.tag === tag);

    // Group by date and aggregate (in case of multiple values per date)
    const dateValues: Map<string, number[]> = new Map();
    for (const p of tagPoints) {
      if (!dateValues.has(p.date)) {
        dateValues.set(p.date, []);
      }
      dateValues.get(p.date)!.push(p.value);
    }

    // Create sorted time-series text
    const sortedDates = [...dateValues.keys()].sort();
    const timeSeriesText = sortedDates
      .map((date) => {
        const values = dateValues.get(date)!;
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        return `${date}: ${avg.toFixed(1)}`;
      })
      .join(' | ');

    // Calculate statistics
    const allValues = tagPoints.map((p) => p.value);
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const avg = allValues.reduce((a, b) => a + b, 0) / allValues.length;

    const tagText = `[TAG: ${tag}] Time-series data from ${sortedDates[0]} to ${sortedDates[sortedDates.length - 1]}. Stats: min=${min.toFixed(1)}, max=${max.toFixed(1)}, avg=${avg.toFixed(1)}. Values: ${timeSeriesText}`;

    embeddings.push(tagText);
  }

  return embeddings;
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

    // Delete all previous data for this user before uploading new data
    const existingDataSources = await DataSource.find({
      userId: session.user.dbId,
    });
    const dataSourceIds = existingDataSources.map((ds) => ds._id);

    if (dataSourceIds.length > 0) {
      await VectorData.deleteMany({ dataSourceId: { $in: dataSourceIds } });
      await DataSource.deleteMany({ userId: session.user.dbId });
      logger.info('Deleted previous data for user', {
        userId: session.user.dbId,
        deletedDataSources: dataSourceIds.length,
      });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let allPoints: TimeSeriesPoint[] = [];
    let allTags: string[] = [];
    let schemaSummary = '';

    if (
      file.name.endsWith('.xlsx') ||
      file.name.endsWith('.xls') ||
      file.name.endsWith('.csv')
    ) {
      const workbook = xlsx.read(buffer, { type: 'buffer' });

      // Process each sheet
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rawData = xlsx.utils.sheet_to_json(sheet, {
          header: 1,
          defval: null,
        }) as unknown[][];

        const { points, tags, dateRange, schema } =
          parseTimeSeriesData(rawData);

        if (points.length > 0) {
          allPoints = allPoints.concat(points);
          allTags = [...new Set([...allTags, ...tags])];
          schemaSummary += `\n### Sheet: ${sheetName}\n${schema}\nDate range: ${dateRange.start} to ${dateRange.end}\n`;
        }
      }

      // Create DataSource
      const dataSource = await DataSource.create({
        userId: session.user.dbId,
        name: file.name,
        sourceType: 'time-series',
        data: allPoints.slice(0, 500), // Store sample of parsed data
        schemaSummary: schemaSummary || 'No time-series structure detected',
      });

      // Create embeddings for each tag's complete time-series
      const tagTexts = createTagEmbeddings(allPoints, allTags);
      const vectorPoints: Partial<IVectorData>[] = [];

      // Add file summary embedding
      const summaryText = `[SUMMARY] File: ${file.name} | Tags: ${allTags.join(', ')} | Total data points: ${allPoints.length}\n${schemaSummary}`;
      tagTexts.unshift(summaryText);

      // Create embeddings in batches
      const BATCH_SIZE = 50;
      for (let i = 0; i < tagTexts.length; i += BATCH_SIZE) {
        const batch = tagTexts.slice(i, i + BATCH_SIZE);
        try {
          const embeddings = await getBatchEmbeddings(batch);
          batch.forEach((content, idx) => {
            vectorPoints.push({
              userId: new mongoose.Types.ObjectId(session.user.dbId),
              dataSourceId: dataSource._id as mongoose.Types.ObjectId,
              content: content,
              embedding: embeddings[idx],
            });
          });
        } catch (vErr) {
          logger.warn('Vector batch failed', vErr);
        }
      }

      if (vectorPoints.length > 0) {
        await VectorData.insertMany(vectorPoints);
      }

      logger.info('Time-series data ingested successfully', {
        file: file.name,
        tags: allTags,
        points: allPoints.length,
        vectors: vectorPoints.length,
      });

      return NextResponse.json({
        message: `Ingested ${file.name} with ${allPoints.length} time-series data points for ${allTags.length} tags.`,
        summary: schemaSummary,
        tags: allTags,
        vectorCount: vectorPoints.length,
      });
    } else {
      // Handle non-spreadsheet files (text, etc.)
      const textContent = buffer.toString('utf-8');
      const sourceType = file.name.split('.').pop() || 'unknown';
      schemaSummary = `Document: ${file.name} - Text content with ${textContent.length} characters.`;

      const dataSource = await DataSource.create({
        userId: session.user.dbId,
        name: file.name,
        sourceType: sourceType,
        data: [],
        schemaSummary: schemaSummary,
      });

      // Split by paragraphs for embedding
      const chunks = textContent
        .split(/\n\n+/)
        .filter((chunk) => chunk.trim().length > 20)
        .map(
          (chunk, idx) => `[${file.name}] Section ${idx + 1}: ${chunk.trim()}`,
        );

      const vectorPoints: Partial<IVectorData>[] = [];

      for (let i = 0; i < chunks.length; i += 50) {
        const batch = chunks.slice(i, i + 50);
        try {
          const embeddings = await getBatchEmbeddings(batch);
          batch.forEach((content, idx) => {
            vectorPoints.push({
              userId: new mongoose.Types.ObjectId(session.user.dbId),
              dataSourceId: dataSource._id as mongoose.Types.ObjectId,
              content: content,
              embedding: embeddings[idx],
            });
          });
        } catch (vErr) {
          logger.warn('Vector batch failed', vErr);
        }
      }

      if (vectorPoints.length > 0) {
        await VectorData.insertMany(vectorPoints);
      }

      return NextResponse.json({
        message: `Ingested ${file.name} for Maifast AI.`,
        summary: dataSource.schemaSummary,
        vectorCount: vectorPoints.length,
      });
    }
  } catch (error: unknown) {
    logger.error('Upload Error', error);
    return NextResponse.json({ error: 'Ingestion failed' }, { status: 500 });
  }
}
