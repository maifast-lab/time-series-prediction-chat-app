import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Chat from '@/models/Chat';
import DataPoint from '@/models/DataPoint';
import Prediction from '@/models/Prediction';
import Evaluation from '@/models/Evaluation';
import { validateCsv } from '@/lib/csv-validator';
import { evaluatePrediction } from '@/lib/predictor';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    // await params for Next.js 15+
    const { id } = await params;

    // 1. Read File buffer
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Check size limit (200MB)
    const MAX_SIZE = 200 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds 200MB limit.' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const content = buffer.toString('utf-8');

    // 2. Load Chat to check context
    const chat = await Chat.findById(id);
    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    // 3. Strict CSV Validation (Structure + Frequency of THIS file)
    const validationResult = validateCsv(content);
    if (!validationResult.isValid || !validationResult.data) {
      return NextResponse.json(
        { error: validationResult.error },
        { status: 400 }
      );
    }

    const newData = validationResult.data;
    const newFrequency = validationResult.frequencyDays;

    // 4. Validate Frequency against Chat Logic
    if (chat.frequencyDays) {
      // Chat already has a frequency, new upload MUST match
      if (newFrequency !== chat.frequencyDays) {
        return NextResponse.json(
          {
            error: `Frequency mismatch. Chat is ${chat.frequencyDays} days, but CSV is ${newFrequency} days.`,
          },
          { status: 400 }
        );
      }
    } else {
      // First upload defines the frequency
      chat.frequencyDays = newFrequency;
      await chat.save();
    }

    // 5. De-duplication & max date check
    // We need to fetch the max date currently in DB to know what to skip is not strictly enough
    // because spec says "If date <= max(date already stored) -> skip silently".
    // But we might have gaps if we only checked max.
    // HOWEVER, the Spec says "Incremental Upload: for each row, if date <= max stored... skip".
    // This implies we only append to the END. We do not back-fill.

    // Let's find current max date efficiently.
    const lastDataPoint = await DataPoint.findOne({ chatId: chat._id }).sort({
      date: -1,
    });
    const maxDateStored = lastDataPoint ? lastDataPoint.date : '0000-00-00';

    let addedCount = 0;
    let skippedCount = 0;
    const toInsert = [];
    const insertedDates: string[] = [];

    for (const row of newData) {
      if (row.date <= maxDateStored) {
        skippedCount++;
      } else {
        // Also need to check if this new chunk has gaps relative to the OLD chunk?
        // "Step 2: Validate Frequency ... CSV frequency must match chat frequency" - we did that for the CSV itself.
        // But if the CSV starts 10 days after the last stored date, is that allowed?
        // Spec Section 3 says "You want to allow... Skipped but consistent intervals" -> wait, no.
        // "Valid examples: [7,7,7]".
        // "Incremental Upload Rules":
        // "No overwrites. Ever."
        // It doesn't explicitly forbid a GAP between the old data and new data, IF the new data itself is internally consistent.
        // BUT "Expected consistent interval". If I have daily data ending Jan 1, and upload daily data starting Jan 5,
        // I have a gap of 4 days.
        // The spec says "Invalid date series... found gaps". This usually applies to the continuous series.
        // Section 3 algorithm is "Sort ALL CSV dates".
        // It implies the SERIES must be consistent.
        // If we ingest, we might break the series consistency if we allow gaps between uploads.
        // However, spec only says "Validate CSV (same rules as above)". It checks the CSV in isolation?
        // "Step 2: Validate Frequency: CSV frequency must match chat frequency".
        // It does NOT say "Combine old + new and validate frequency".
        // So we will assume the isolated CSV is enough, OR we should check continuity?
        // "Validation rules: ... found gaps".
        // Let's stick to strict Spec: Section 4, Step 1 & 2 only check the CSV and the stored frequency scalar.
        // It does NOT say "check continuity with previous data".
        // Use strict interpretation: If CSV is valid compliant series, and freq matches, we ingest.

        toInsert.push({
          chatId: chat._id,
          date: row.date,
          value: row.value,
        });
        insertedDates.push(row.date);
        addedCount++;
      }
    }

    if (addedCount > 0) {
      await DataPoint.insertMany(toInsert);

      // Update chat lastDate
      // sorted input, so last item is max
      const newMax = newData[newData.length - 1].date;
      chat.lastDate = newMax;
      await chat.save();

      // 6. Trigger Evaluation (Silent)
      // "For each prediction where: prediction.targetDate == newly ingested date"
      const predictionsToEval = await Prediction.find({
        chatId: chat._id,
        targetDate: { $in: insertedDates },
      });

      for (const pred of predictionsToEval) {
        // Find the actual value we just inserted
        const actualRow = toInsert.find((r) => r.date === pred.targetDate);
        if (actualRow) {
          const results = evaluatePrediction(
            pred.predictedValue,
            actualRow.value
          );

          // Check if already evaluated? Spec says "User never sees this", but we should probably avoid duplicates?
          // Mongoose "unique" index on predictionId in EvaluationSchema handles this potentially,
          // but let's be safe.
          const exists = await Evaluation.exists({ predictionId: pred._id });
          if (!exists) {
            await Evaluation.create({
              predictionId: pred._id,
              actualValue: actualRow.value,
              ...results,
            });
          }
        }
      }
    }

    return NextResponse.json({
      message: 'Upload processed',
      added: addedCount,
      skipped: skippedCount,
    });
  } catch (error) {
    console.error('Upload Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
