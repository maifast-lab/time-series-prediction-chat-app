export interface TimeSeriesPointLike {
  tag: string;
  date: Date | string;
  value: number;
}

export interface SheetJsonPoint {
  date: string;
  value: number;
}

export interface SheetJsonSeries {
  tag: string;
  totalPoints: number;
  startDate: string;
  endDate: string;
  values: number[];
  points: SheetJsonPoint[];
}

export interface SequenceMatch {
  tag: string;
  occurrenceIndex: number;
  matchedWindow: SheetJsonPoint[];
  nextPoint: SheetJsonPoint | null;
}

export interface PredictionEvidence {
  tag: string;
  occurrenceIndex: number;
  windowSize: number;
  matchedQueryWindow: number[];
  matchedWindow: SheetJsonPoint[];
  nextPoint: SheetJsonPoint;
}

export interface PredictionCandidate {
  predictedValue: number;
  score: number;
  supportCount: number;
  exactSupportCount: number;
  strongestWindowSize: number;
  sourceTags: string[];
  evidences: PredictionEvidence[];
}

export interface PredictionTrainingContext {
  querySequence: number[];
  minWindowSize: number;
  analyzedWindowSize: number;
  totalEvidenceCount: number;
  dominantCandidate: PredictionCandidate | null;
  candidates: PredictionCandidate[];
}

function toDateOnly(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

function groupAndSortPoints(points: TimeSeriesPointLike[]) {
  const grouped = new Map<string, SheetJsonPoint[]>();

  points
    .filter(
      (point) =>
        point.tag &&
        Number.isFinite(point.value) &&
        !Number.isNaN(new Date(point.date).getTime()),
    )
    .sort(
      (a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime() ||
        a.tag.localeCompare(b.tag),
    )
    .forEach((point) => {
      const item = {
        date: toDateOnly(point.date),
        value: Number(point.value),
      };

      if (!grouped.has(point.tag)) {
        grouped.set(point.tag, []);
      }

      grouped.get(point.tag)!.push(item);
    });

  return grouped;
}

export function buildSheetJson(
  points: TimeSeriesPointLike[],
  options: { maxPointsPerTag?: number } = {},
): SheetJsonSeries[] {
  const { maxPointsPerTag = 30 } = options;
  const grouped = groupAndSortPoints(points);

  return Array.from(grouped.entries()).map(([tag, tagPoints]) => {
    const visiblePoints = tagPoints.slice(-maxPointsPerTag);

    return {
      tag,
      totalPoints: tagPoints.length,
      startDate: tagPoints[0]?.date || '',
      endDate: tagPoints[tagPoints.length - 1]?.date || '',
      values: visiblePoints.map((point) => point.value),
      points: visiblePoints,
    };
  });
}

export function extractNumericSequence(text: string): number[] {
  return Array.from(text.matchAll(/-?\d+(?:\.\d+)?/g))
    .map((match) => Number(match[0]))
    .filter((value) => Number.isFinite(value));
}

export function findExactSequenceMatches(
  points: TimeSeriesPointLike[],
  sequence: number[],
  options: { maxMatches?: number } = {},
): SequenceMatch[] {
  const { maxMatches = 8 } = options;

  if (sequence.length < 2) {
    return [];
  }

  const grouped = groupAndSortPoints(points);
  const matches: SequenceMatch[] = [];

  for (const [tag, tagPoints] of grouped.entries()) {
    for (let index = 0; index <= tagPoints.length - sequence.length; index++) {
      const window = tagPoints.slice(index, index + sequence.length);
      const isExactMatch = window.every(
        (point, windowIndex) => point.value === sequence[windowIndex],
      );

      if (!isExactMatch) {
        continue;
      }

      matches.push({
        tag,
        occurrenceIndex: index,
        matchedWindow: window,
        nextPoint: tagPoints[index + sequence.length] || null,
      });

      if (matches.length >= maxMatches) {
        return matches;
      }
    }
  }

  return matches;
}

export function buildPredictionTrainingContext(
  points: TimeSeriesPointLike[],
  sequence: number[],
  options: {
    maxWindowSize?: number;
    minWindowSize?: number;
    maxCandidates?: number;
    maxEvidencePerCandidate?: number;
  } = {},
): PredictionTrainingContext {
  const {
    maxWindowSize = 6,
    minWindowSize = 2,
    maxCandidates = 5,
    maxEvidencePerCandidate = 5,
  } = options;

  const normalizedMinWindowSize = Math.max(2, minWindowSize);
  const analyzedWindowSize = Math.min(sequence.length, maxWindowSize);

  if (analyzedWindowSize < normalizedMinWindowSize) {
    return {
      querySequence: sequence,
      minWindowSize: normalizedMinWindowSize,
      analyzedWindowSize,
      totalEvidenceCount: 0,
      dominantCandidate: null,
      candidates: [],
    };
  }

  const grouped = groupAndSortPoints(points);
  const candidateMap = new Map<number, PredictionCandidate>();
  let totalEvidenceCount = 0;

  for (const [tag, tagPoints] of grouped.entries()) {
    for (let nextIndex = normalizedMinWindowSize; nextIndex < tagPoints.length; nextIndex++) {
      const availableWindow = Math.min(analyzedWindowSize, nextIndex);
      let strongestMatchSize = 0;
      let strongestMatchWindow: SheetJsonPoint[] | null = null;

      for (let windowSize = availableWindow; windowSize >= normalizedMinWindowSize; windowSize--) {
        const matchedQueryWindow = sequence.slice(-windowSize);
        const historyWindow = tagPoints.slice(nextIndex - windowSize, nextIndex);
        const isMatch = historyWindow.every(
          (point, index) => point.value === matchedQueryWindow[index],
        );

        if (!isMatch) {
          continue;
        }

        strongestMatchSize = windowSize;
        strongestMatchWindow = historyWindow;
        break;
      }

      if (!strongestMatchSize || !strongestMatchWindow) {
        continue;
      }

      const nextPoint = tagPoints[nextIndex];
      const predictedValue = nextPoint.value;
      const recencyBoost = Number(((nextIndex + 1) / tagPoints.length).toFixed(3));
      const scoreIncrement =
        strongestMatchSize * 10 +
        (strongestMatchSize === sequence.length ? 25 : 0) +
        recencyBoost;

      if (!candidateMap.has(predictedValue)) {
        candidateMap.set(predictedValue, {
          predictedValue,
          score: 0,
          supportCount: 0,
          exactSupportCount: 0,
          strongestWindowSize: 0,
          sourceTags: [],
          evidences: [],
        });
      }

      const candidate = candidateMap.get(predictedValue)!;
      candidate.score = Number((candidate.score + scoreIncrement).toFixed(3));
      candidate.supportCount += 1;
      candidate.strongestWindowSize = Math.max(
        candidate.strongestWindowSize,
        strongestMatchSize,
      );

      if (strongestMatchSize === sequence.length) {
        candidate.exactSupportCount += 1;
      }

      if (!candidate.sourceTags.includes(tag)) {
        candidate.sourceTags.push(tag);
      }

      if (candidate.evidences.length < maxEvidencePerCandidate) {
        candidate.evidences.push({
          tag,
          occurrenceIndex: nextIndex - strongestMatchSize,
          windowSize: strongestMatchSize,
          matchedQueryWindow: sequence.slice(-strongestMatchSize),
          matchedWindow: strongestMatchWindow,
          nextPoint,
        });
      }

      totalEvidenceCount += 1;
    }
  }

  const candidates = Array.from(candidateMap.values())
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (right.strongestWindowSize !== left.strongestWindowSize) {
        return right.strongestWindowSize - left.strongestWindowSize;
      }
      if (right.exactSupportCount !== left.exactSupportCount) {
        return right.exactSupportCount - left.exactSupportCount;
      }
      return right.supportCount - left.supportCount;
    })
    .slice(0, maxCandidates);

  return {
    querySequence: sequence,
    minWindowSize: normalizedMinWindowSize,
    analyzedWindowSize,
    totalEvidenceCount,
    dominantCandidate: candidates[0] || null,
    candidates,
  };
}
