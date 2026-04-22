export interface HistoryPoint {
  tag: string;
  date: Date;
  value: number;
  label?: string;
}

interface NumberedPoint extends HistoryPoint {
  rowNumber: number;
}

export interface PatternMatch {
  tag: string;
  nextRow: number;
  nextPoint: HistoryPoint;
  matchType: "fixed-gap" | "growing-gap" | "decreasing-gap";
}

export interface PatternAnswerPhrases {
  matchHeader?: string;
  noMatch?: string;
}

export type ReadableYearMonthData = Record<
  string,
  Record<string, Array<Record<string, unknown[]>>>
>;

const MONTH_KEY_TO_NUMBER: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const numericValue = Number(value.trim().replace(/,/g, ""));
  return Number.isFinite(numericValue) ? numericValue : null;
}

export function isReadableYearMonthData(
  data: unknown,
): data is ReadableYearMonthData {
  if (!isRecord(data)) {
    return false;
  }

  return Object.entries(data).some(([year, months]) => {
    if (!/^\d{4}$/.test(year) || !isRecord(months)) {
      return false;
    }

    return Object.entries(months).some(([month, seriesList]) => {
      if (
        !MONTH_KEY_TO_NUMBER[month.toLowerCase()] ||
        !Array.isArray(seriesList)
      ) {
        return false;
      }

      return seriesList.some((series) => {
        if (!isRecord(series)) {
          return false;
        }

        return Object.values(series).some(Array.isArray);
      });
    });
  });
}

function getDateForParts(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateParts(year: number, month: number, day: number): string {
  const date = getDateForParts(year, month, day);

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return `Row ${day}`;
  }

  const monthName = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  })
    .format(date)
    .toLowerCase();

  return `${day} ${monthName} ${year}`;
}

export function buildReadableDataHistoryPoints(
  data: ReadableYearMonthData,
): HistoryPoint[] {
  const points: HistoryPoint[] = [];

  for (const [yearKey, months] of Object.entries(data)) {
    const year = Number(yearKey);
    if (!Number.isInteger(year)) {
      continue;
    }

    for (const [monthKey, seriesList] of Object.entries(months)) {
      const month = MONTH_KEY_TO_NUMBER[monthKey.toLowerCase()];
      if (!month || !Array.isArray(seriesList)) {
        continue;
      }

      for (const series of seriesList) {
        if (!isRecord(series)) {
          continue;
        }

        for (const [tag, values] of Object.entries(series)) {
          if (!Array.isArray(values)) {
            continue;
          }

          values.forEach((rawValue, index) => {
            const value = toFiniteNumber(rawValue);
            if (value === null) {
              return;
            }

            const day = index + 1;
            const monthLabel = String(month).padStart(2, "0");

            points.push({
              tag: `${tag}::${year}-${monthLabel}`,
              date: getDateForParts(year, month, day),
              value,
              label: formatDateParts(year, month, day),
            });
          });
        }
      }
    }
  }

  return points;
}

function groupHistoryBySeries(
  points: HistoryPoint[],
  getSeriesKey: (point: HistoryPoint) => string,
): Map<string, NumberedPoint[]> {
  const grouped = new Map<string, HistoryPoint[]>();

  points.forEach((point) => {
    const seriesKey = getSeriesKey(point);

    if (!grouped.has(seriesKey)) {
      grouped.set(seriesKey, []);
    }

    grouped.get(seriesKey)!.push(point);
  });

  return new Map(
    Array.from(grouped.entries()).map(([seriesKey, tagPoints]) => [
      seriesKey,
      tagPoints
        .sort((left, right) => left.date.getTime() - right.date.getTime())
        .map((point, index) => ({
          ...point,
          rowNumber: index + 1,
        })),
    ]),
  );
}

function getCalendarMonthSeriesKey(point: HistoryPoint): string {
  const year = point.date.getUTCFullYear();
  const month = String(point.date.getUTCMonth() + 1).padStart(2, "0");

  return `${point.tag}::${year}-${month}`;
}

function getCellValueByRow(points: NumberedPoint[]): Map<number, NumberedPoint> {
  return new Map(points.map((point) => [point.rowNumber, point]));
}

function findFixedGapMatch(
  points: NumberedPoint[],
  sequence: number[],
): { nextRow: number; nextPoint: NumberedPoint } | null {
  const rowPointMap = getCellValueByRow(points);
  const rows = points.map((point) => point.rowNumber);
  const maxRow = rows[rows.length - 1] ?? 0;

  for (const row1 of rows) {
    if (rowPointMap.get(row1)?.value !== sequence[0]) {
      continue;
    }

    for (let diff = 1; row1 + diff * 4 <= maxRow; diff++) {
      const row2 = row1 + diff;
      const row3 = row2 + diff;
      const row4 = row3 + diff;
      const nextRow = row4 + diff;
      const nextPoint = rowPointMap.get(nextRow);

      if (
        rowPointMap.get(row2)?.value === sequence[1] &&
        rowPointMap.get(row3)?.value === sequence[2] &&
        rowPointMap.get(row4)?.value === sequence[3] &&
        nextPoint
      ) {
        return { nextRow, nextPoint };
      }
    }
  }

  return null;
}

function findGrowingGapMatch(
  points: NumberedPoint[],
  sequence: number[],
): { nextRow: number; nextPoint: NumberedPoint } | null {
  const rowPointMap = getCellValueByRow(points);
  const rows = points.map((point) => point.rowNumber);
  const maxRow = rows[rows.length - 1] ?? 0;

  for (const row1 of rows) {
    if (rowPointMap.get(row1)?.value !== sequence[0]) {
      continue;
    }

    for (let diff = 1; row1 + diff * 4 + 6 <= maxRow; diff++) {
      for (let growth = 1; row1 + diff * 4 + growth * 6 <= maxRow; growth++) {
        const row2 = row1 + diff;
        const row3 = row2 + diff + growth;
        const row4 = row3 + diff + growth * 2;
        const nextRow = row4 + diff + growth * 3;
        const nextPoint = rowPointMap.get(nextRow);

        if (
          rowPointMap.get(row2)?.value === sequence[1] &&
          rowPointMap.get(row3)?.value === sequence[2] &&
          rowPointMap.get(row4)?.value === sequence[3] &&
          nextPoint
        ) {
          return { nextRow, nextPoint };
        }
      }
    }
  }

  return null;
}

function findDecreasingGapMatch(
  points: NumberedPoint[],
  sequence: number[],
): { nextRow: number; nextPoint: NumberedPoint } | null {
  const rowPointMap = getCellValueByRow(points);
  const rows = points.map((point) => point.rowNumber);
  const maxRow = rows[rows.length - 1] ?? 0;

  for (const row1 of rows) {
    if (rowPointMap.get(row1)?.value !== sequence[0]) {
      continue;
    }

    for (let diff = 1; row1 + diff <= maxRow; diff++) {
      const maxDecrease = Math.floor((diff - 1) / 3);

      for (let decrease = maxDecrease; decrease >= 1; decrease--) {
        const diff2 = diff - decrease;
        const diff3 = diff2 - decrease;
        const nextDiff = diff3 - decrease;

        if (nextDiff < 1) {
          continue;
        }

        const row2 = row1 + diff;
        const row3 = row2 + diff2;
        const row4 = row3 + diff3;
        const nextRow = row4 + nextDiff;
        const nextPoint = rowPointMap.get(nextRow);

        if (
          rowPointMap.get(row2)?.value === sequence[1] &&
          rowPointMap.get(row3)?.value === sequence[2] &&
          rowPointMap.get(row4)?.value === sequence[3] &&
          nextPoint
        ) {
          return { nextRow, nextPoint };
        }
      }
    }
  }

  return null;
}

export function findPatternMatches(
  historyPoints: HistoryPoint[],
  sequence: number[],
  options: { seriesMode: "tag" | "calendar-month" } = { seriesMode: "tag" },
): PatternMatch[] {
  const matches: PatternMatch[] = [];
  const grouped =
    options.seriesMode === "calendar-month"
      ? groupHistoryBySeries(historyPoints, getCalendarMonthSeriesKey)
      : groupHistoryBySeries(historyPoints, (point) => point.tag);

  for (const [seriesKey, tagPoints] of grouped.entries()) {
    if (tagPoints.length < 5) {
      continue;
    }

    const fixedMatch = findFixedGapMatch(tagPoints, sequence);
    const growingMatch = fixedMatch
      ? null
      : findGrowingGapMatch(tagPoints, sequence);
    const decreasingMatch =
      fixedMatch || growingMatch
        ? null
        : findDecreasingGapMatch(tagPoints, sequence);
    const foundMatch = fixedMatch ?? growingMatch ?? decreasingMatch;

    if (!foundMatch) {
      continue;
    }

    const matchType = fixedMatch
      ? "fixed-gap"
      : growingMatch
        ? "growing-gap"
        : "decreasing-gap";

    matches.push({
      tag: seriesKey,
      nextRow: foundMatch.nextRow,
      nextPoint: foundMatch.nextPoint,
      matchType,
    });
  }

  return matches;
}

function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(8)));
}

function formatPointLabel(
  point: HistoryPoint,
  rowNumber: number,
  isRowGridSource: boolean,
): string {
  if (point.label) {
    return point.label;
  }

  const { date } = point;

  if (
    isRowGridSource ||
    (date.getUTCFullYear() === 2000 && date.getUTCMonth() === 0)
  ) {
    return `Row ${rowNumber}`;
  }

  const day = date.getUTCDate();
  const month = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  })
    .format(date)
    .toLowerCase();
  const year = date.getUTCFullYear();

  return `${day} ${month} ${year}`;
}

function formatMatchHeader(count: number, phrases?: PatternAnswerPhrases): string {
  const template = phrases?.matchHeader?.trim();

  if (!template) {
    return `Ye pattern ${count} jgh mila hai :`;
  }

  return template.includes("{count}")
    ? template.replaceAll("{count}", String(count))
    : `${template} ${count}`;
}

export function buildPatternAnswer(
  matches: PatternMatch[],
  options: {
    isRowGridSource: boolean;
    phrases?: PatternAnswerPhrases;
  },
): string {
  if (matches.length === 0) {
    return options.phrases?.noMatch?.trim() || "Ye pattern nhi mila";
  }
  console.log(matches , options);
  const visibleMatches = [...matches]
    // .sort(
    //   (left, right) =>
    //     left.nextPoint.date.getTime() - right.nextPoint.date.getTime() ||
    //     left.tag.localeCompare(right.tag) ||
    //     left.nextRow - right.nextRow,
    // )
    .slice(0, 5);
  const lines = visibleMatches.map((match) => {
    const label = formatPointLabel(
      match.nextPoint,
      match.nextRow,
      options.isRowGridSource,
    );

    return `${label} - ${formatNumber(match.nextPoint.value)}`;
  });

  return [formatMatchHeader(visibleMatches.length, options.phrases), ...lines].join(
    "\n",
  );
}
