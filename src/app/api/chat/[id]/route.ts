import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Chat from '@/models/Chat';
import DataPoint from '@/models/DataPoint';
import Prediction from '@/models/Prediction';
import Evaluation from '@/models/Evaluation'; // Just in case we want to show stats

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const { id } = await params;

    const chat = await Chat.findById(id);

    if (!chat || chat.isDeleted) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    } // Fetch history (limit 100 for graph?)
    const history = await DataPoint.find({ chatId: chat._id }).sort({
      date: 1,
    });

    // Fetch predictions (evaluations are child of predictions)
    const predictions = await Prediction.find({ chatId: chat._id }).sort({
      targetDate: 1,
    });

    // Fetch evaluations
    // Optimization: Look up evaluations for these predictions
    const predIds = predictions.map((p) => p._id);
    const evaluations = await Evaluation.find({
      predictionId: { $in: predIds },
    });

    // Stitch evaluations to predictions
    const predictionsWithEval = predictions.map((p) => {
      const ev = evaluations.find(
        (e) => e.predictionId.toString() === p._id.toString()
      );
      return {
        ...p.toObject(),
        evaluation: ev ? ev : null,
      };
    });

    return NextResponse.json({
      chat,
      history,
      predictions: predictionsWithEval,
    });
  } catch (error) {
    console.error('Get Chat Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
