import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Chat from '@/models/Chat';
import DataPoint from '@/models/DataPoint';
import Prediction from '@/models/Prediction';
import { calculateRollingMean } from '@/lib/predictor';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const { id } = await params;

    const chat = await Chat.findById(id);
    if (!chat)
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });

    if (!chat.frequencyDays) {
      return NextResponse.json(
        { error: 'Cannot predict without data history / frequency.' },
        { status: 400 }
      );
    }

    // Fetch all data for this chat to calculate rolling mean
    // Optimization: We could only fetch last N=7, but "Rolling Mean" baseline says min(7, total).
    // Let's fetch last 20 to be safe and sort them.
    const recentData = await DataPoint.find({ chatId: chat._id })
      .sort({ date: -1 }) // Descending
      .limit(20);

    if (recentData.length === 0) {
      return NextResponse.json(
        { error: 'Not enough data to predict.' },
        { status: 400 }
      );
    }

    // Determine Target Date
    // D_last = max stored date
    const dLast = new Date(recentData[0].date); // recentData is desc, so 0 is max

    // "If dataset includes today's date exactly -> predict today" ??
    // Spec Step 5: "If dataset includes today's date exactly: Predict today. Else: Predict D_next"
    // Wait. If dataset HAS today's date, it means we HAVE the actual value for today.
    // Why predict it?
    // Maybe the spec implies: If "today" is THE LAST date in DB, we want to predict "tomorrow" (or next freq).
    // OR: "If dataset includes today's date exactly" -> it might mean "Predict(today)" is what we return?
    // BUT we already HAVE the value.
    // Let's re-read: "If dataset includes today's date exactly -> Predict today".
    // This sounds like a retroactive prediction or maybe "today" hasn't "happened" yet in terms of data upload?
    // BUT "dataset includes" means we UPLOADED it.
    // If I uploaded data for 2023-10-27 (Today), why predict 2023-10-27?
    // Maybe "today" refers to REAL WORLD today?
    // Case A: Last Data = Yesterday. Real = Today. Target = Today.
    // Case B: Last Data = Today. Real = Today. Target = Today?
    // Let's follow strict text:
    // 1. D_last = max stored date.
    // 2. If D_last == Today -> Predict Today (?? This implies re-predicting known data? Or maybe the user wants to see what the model WOULD have said?)
    // 3. Else -> Predict D_last + freq.

    // Actually, "If dataset includes today's date exactly"
    // Let's check if "today" exists in the DB.

    const todayStr = new Date().toISOString().split('T')[0];
    const hasToday = recentData.some((d) => d.date === todayStr);

    let targetDateStr: string;

    if (hasToday) {
      targetDateStr = todayStr;
    } else {
      // Recursive Logic:
      // 1. Get Real Data (already fetched as recentData)
      // 2. Get Future Predictions (predictions made for dates AFTER the last real data)
      // 3. Combine to form "Effective History" for the next prediction step.

      const lastRealDate = recentData[0].date;

      const futurePredictions = await Prediction.find({
        chatId: chat._id,
        targetDate: { $gt: lastRealDate },
      }).sort({ targetDate: 1 });

      const effectiveHistory = [
        ...recentData.map((d) => ({ date: d.date, value: d.value })).reverse(),
        ...futurePredictions.map((p) => ({
          date: p.targetDate,
          value: p.predictedValue,
        })),
      ];

      const lastEffectiveItem = effectiveHistory[effectiveHistory.length - 1];
      const lastEffectiveDateObj = new Date(lastEffectiveItem.date);
      const freqMs = (chat.frequencyDays || 1) * 24 * 60 * 60 * 1000;
      const targetDateObj = new Date(lastEffectiveDateObj.getTime() + freqMs);
      targetDateStr = targetDateObj.toISOString().split('T')[0];
    }

    // Common prediction logic using recentData OR mixed data
    // If hasToday is true, we use recentData as is.
    // If hasToday is false, we should probably use the effectiveHistory we just built?
    // Let's rebuild the input data for calculateRollingMean
    const lastRealDate = recentData[0].date;
    const futurePredictionsForCalc = await Prediction.find({
      chatId: chat._id,
      targetDate: { $gt: lastRealDate, $lt: targetDateStr },
    }).sort({ targetDate: -1 });

    const mixedDataDesc = [
      ...futurePredictionsForCalc.map((p) => ({
        date: p.targetDate,
        value: p.predictedValue,
      })),
      ...recentData.map((d) => ({ date: d.date, value: d.value })),
    ];

    let predictionValue = calculateRollingMean(mixedDataDesc, 7);

    // Check if input data is Integer-based
    const isIntegerSeries = recentData.every((d) => Number.isInteger(d.value));
    if (isIntegerSeries) {
      predictionValue = Math.round(predictionValue);
    }

    // Apply Bounds Constraints
    if (chat.minBound !== undefined && chat.minBound !== null) {
      predictionValue = Math.max(chat.minBound, predictionValue);
    }
    if (chat.maxBound !== undefined && chat.maxBound !== null) {
      predictionValue = Math.min(chat.maxBound, predictionValue);
    }

    // Save
    const prediction = await Prediction.create({
      chatId: chat._id,
      targetDate: targetDateStr,
      predictedValue: predictionValue,
      algorithmVersion: 'mean_v1',
      basedOnLastDate: recentData[0].date,
    });

    return NextResponse.json({
      prediction: predictionValue,
      targetDate: targetDateStr,
      algorithm: 'mean_v1',
    });
  } catch (error) {
    console.error('Prediction Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
