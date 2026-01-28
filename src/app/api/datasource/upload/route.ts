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

    const buffer = Buffer.from(await file.arrayBuffer());
    let textContent = '';
    const rawData: any[] = [];
    let sourceType = '';
    let schemaSummary = '';

    if (
      file.name.endsWith('.xlsx') ||
      file.name.endsWith('.xls') ||
      file.name.endsWith('.csv')
    ) {
      const workbook = xlsx.read(buffer, { type: 'buffer' });
      workbook.SheetNames.forEach((sheetName: string) => {
        const sheet = workbook.Sheets[sheetName];
        const json = xlsx.utils.sheet_to_json(sheet) as any[];
        rawData.push(...json);
        textContent += `\nSheet: ${sheetName}\n${JSON.stringify(json.slice(0, 10))}`;
      });
      sourceType = 'spreadsheet';
      schemaSummary = `Spreadsheet with ${workbook.SheetNames.length} sheets: ${workbook.SheetNames.join(', ')}`;
    } else {
      textContent = buffer.toString('utf-8');
      sourceType = file.name.split('.').pop() || 'unknown';
      schemaSummary = `Document: ${file.name} - Processed as general data.`;
    }

    const dataSource = await DataSource.create({
      userId: session.user.dbId,
      name: file.name,
      sourceType: sourceType,
      data: rawData,
      schemaSummary: schemaSummary,
    });

    const chunks = textContent.match(/[\s\S]{1,1000}/g) || [];
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
    });
  } catch (error: unknown) {
    logger.error('Upload Error', error);
    return NextResponse.json({ error: 'Ingestion failed' }, { status: 500 });
  }
}
