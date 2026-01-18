import { IDataPoint } from '@/models/DataPoint';

// N = min(7, total_points)
// prediction = average(last N values)
export function calculateRollingMean(
  dataPoints: { date: string; value: number }[],
  windowSize: number = 7
): number {
  if (dataPoints.length === 0) return 0;

  const sorted = [...dataPoints].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const n = Math.min(windowSize, sorted.length);
  const slice = sorted.slice(-n);

  const sum = slice.reduce((acc, curr) => acc + curr.value, 0);
  return sum / n;
}

export interface EvaluationResult {
  error: number;
  absoluteError: number;
  percentageError: number;
}

export function evaluatePrediction(
  predicted: number,
  actual: number
): EvaluationResult {
  const error = actual - predicted;
  const absoluteError = Math.abs(error);
  const percentageError =
    Math.abs(error) / (actual === 0 ? 1 : Math.abs(actual)); // Avoid divide by zero, though spec says infinite numeric.

  return {
    error,
    absoluteError,
    percentageError,
  };
}
