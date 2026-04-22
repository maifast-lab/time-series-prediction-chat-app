import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import * as XLSX from "xlsx";
interface NumericPoint {
  rowNumber: number;
  sheetRowIndex: number;
  value: number;
}
interface PatternMatch {
  sheetName: string;
  columnIndex: number;
  nextRow: number;
  label: string;
  value: number;
  matchType: "fixed-gap" | "growing-gap" | "decreasing-gap";
}
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
function extractNumericSequence(text: string): number[] {
  return Array.from(text.matchAll(/-?\d+(?:\.\d+)?/g)).map((match) =>
    Number(match[0]),
  );
}
function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim().replace(/,/g, "");
  if (!cleaned) {
    return null;
  }

  const numericValue = Number(cleaned);
  return Number.isFinite(numericValue) ? numericValue : null;
}
function isDateLike(value: unknown): boolean {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return true;
  }

  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed || toNumber(trimmed) !== null) {
    return false;
  }

  return !Number.isNaN(Date.parse(trimmed));
}
function isYear(value: unknown): boolean {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1900 && year <= 2100;
}
function isMonth(value: unknown): boolean {
  return typeof value === "string" && MONTH_MAP[value.toUpperCase()] !== undefined;
}
function getMonthNumber(value: unknown): number | null {
  if (typeof value === "number" && value >= 1 && value <= 12) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  return MONTH_MAP[value.toUpperCase()] ?? null;
}
function isHeaderRow(row: unknown[] = []): boolean {
  const populatedCells = row.filter((cell) => cell !== null && cell !== "");
  if (populatedCells.length === 0) {
    return false;
  }

  const textCells = populatedCells.filter(
    (cell) => typeof cell === "string" && toNumber(cell) === null,
  );

  return textCells.length >= Math.ceil(populatedCells.length / 2);
}
function getMaxColumnCount(rows: unknown[][]): number {
  return Math.max(...rows.map((row) => row.length), 0);
}
function findLabelColumn(rows: unknown[][], headerOffset: number): number | null {
  const maxCols = getMaxColumnCount(rows);
  const headerRow = headerOffset > 0 ? rows[0] || [] : [];

  for (let colIndex = 0; colIndex < maxCols; colIndex++) {
    const header = String(headerRow[colIndex] ?? "").trim().toLowerCase();
    if (/^(date|day|month|time|timestamp)$/i.test(header)) {
      return colIndex;
    }
  }

  let bestColumn: { colIndex: number; dateCount: number } | null = null;

  for (let colIndex = 0; colIndex < maxCols; colIndex++) {
    let dateCount = 0;
    let checkedCount = 0;

    for (let rowIndex = headerOffset; rowIndex < Math.min(rows.length, headerOffset + 25); rowIndex++) {
      const cell = rows[rowIndex]?.[colIndex];
      if (cell === null || cell === "") {
        continue;
      }

      checkedCount += 1;
      if (isDateLike(cell)) {
        dateCount += 1;
      }
    }

    if (
      checkedCount > 0 &&
      dateCount / checkedCount >= 0.6 &&
      (!bestColumn || dateCount > bestColumn.dateCount)
    ) {
      bestColumn = { colIndex, dateCount };
    }
  }

  return bestColumn?.colIndex ?? null;
}
function formatLabel(value: unknown, fallbackRow: number): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const day = value.getUTCDate();
    const month = new Intl.DateTimeFormat("en-US", {
      month: "long",
      timeZone: "UTC",
    }).format(value).toLowerCase(); // lowercase month
    const year = value.getUTCFullYear();

    return `${day} ${month} ${year}`;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    const parsedDate = new Date(trimmed);

    if (trimmed && Number.isNaN(parsedDate.getTime())) {
      return trimmed;
    }

    if (trimmed) {
      const day = parsedDate.getUTCDate();
      const month = new Intl.DateTimeFormat("en-US", {
        month: "long",
        timeZone: "UTC",
      }).format(parsedDate).toLowerCase();
      const year = parsedDate.getUTCFullYear();

      return `${day} ${month} ${year}`;
    }
  }

  return `Row ${fallbackRow}`;
}
function formatDateParts(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));

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
  }).format(date).toLowerCase();

  return `${day} ${monthName} ${year}`;
}
function getCellValueByRow(points: NumericPoint[]): Map<number, number> {
  return new Map(points.map((point) => [point.rowNumber, point.value]));
}
function findFixedGapMatch(
  points: NumericPoint[],
  sequence: number[],
): { nextRow: number; value: number } | null {
  const rowValueMap = getCellValueByRow(points);
  const rows = points.map((point) => point.rowNumber);
  const maxRow = rows[rows.length - 1] ?? 0;

  for (const row1 of rows) {
    if (rowValueMap.get(row1) !== sequence[0]) {
      continue;
    }

    for (let diff = 1; row1 + diff * 4 <= maxRow; diff++) {
      const row2 = row1 + diff;
      const row3 = row2 + diff;
      const row4 = row3 + diff;
      const nextRow = row4 + diff;
      const nextValue = rowValueMap.get(nextRow);

      if (
        rowValueMap.get(row2) === sequence[1] &&
        rowValueMap.get(row3) === sequence[2] &&
        rowValueMap.get(row4) === sequence[3] &&
        nextValue !== undefined
      ) {
        return { nextRow, value: nextValue };
      }
    }
  }

  return null;
}
function findGrowingGapMatch(
  points: NumericPoint[],
  sequence: number[],
): { nextRow: number; value: number } | null {
  const rowValueMap = getCellValueByRow(points);
  const rows = points.map((point) => point.rowNumber);
  const maxRow = rows[rows.length - 1] ?? 0;

  for (const row1 of rows) {
    if (rowValueMap.get(row1) !== sequence[0]) {
      continue;
    }

    for (let diff = 1; row1 + diff * 4 + 6 <= maxRow; diff++) {
      for (let growth = 1; row1 + diff * 4 + growth * 6 <= maxRow; growth++) {
        const row2 = row1 + diff;
        const row3 = row2 + diff + growth;
        const row4 = row3 + diff + growth * 2;
        const nextRow = row4 + diff + growth * 3;
        const nextValue = rowValueMap.get(nextRow);

        if (
          rowValueMap.get(row2) === sequence[1] &&
          rowValueMap.get(row3) === sequence[2] &&
          rowValueMap.get(row4) === sequence[3] &&
          nextValue !== undefined
        ) {
          return { nextRow, value: nextValue };
        }
      }
    }
  }

  return null;
}
function findDecreasingGapMatch(
  points: NumericPoint[],
  sequence: number[],
): { nextRow: number; value: number } | null {
  const rowValueMap = getCellValueByRow(points);
  const rows = points.map((point) => point.rowNumber);
  const maxRow = rows[rows.length - 1] ?? 0;

  for (const row1 of rows) {
    if (rowValueMap.get(row1) !== sequence[0]) {
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
        const nextValue = rowValueMap.get(nextRow);

        if (
          rowValueMap.get(row2) === sequence[1] &&
          rowValueMap.get(row3) === sequence[2] &&
          rowValueMap.get(row4) === sequence[3] &&
          nextValue !== undefined
        ) {
          return { nextRow, value: nextValue };
        }
      }
    }
  }

  return null;
}
function buildColumnPoints(
  rows: unknown[][],
  columnIndex: number,
  headerOffset: number,
): NumericPoint[] {
  const points: NumericPoint[] = [];

  for (let rowIndex = headerOffset; rowIndex < rows.length; rowIndex++) {
    const value = toNumber(rows[rowIndex]?.[columnIndex]);
    if (value === null) {
      continue;
    }

    points.push({
      rowNumber: rowIndex - headerOffset + 1,
      sheetRowIndex: rowIndex,
      value,
    });
  }

  return points;
}
function looksLikeMonthGrid(rows: unknown[][]): boolean {
  if (rows.length < 4) {
    return false;
  }

  const yearHeaderCount = (rows[0] || []).filter(isYear).length;
  const monthHeaderCount = (rows[1] || []).filter(isMonth).length;
  const tagHeaderCount = (rows[2] || []).filter(
    (cell) => cell !== null && cell !== "",
  ).length;

  return yearHeaderCount > 0 && monthHeaderCount > 0 && tagHeaderCount > 0;
}
function fillMonthGridHeaders(rows: unknown[][]): {
  years: Array<number | null>;
  months: Array<number | null>;
  lastColumnIndex: number;
} {
  const maxCols = getMaxColumnCount(rows);
  const years: Array<number | null> = [];
  const months: Array<number | null> = [];

  let currentYear: number | null = null;
  for (let columnIndex = 0; columnIndex < maxCols; columnIndex++) {
    const cell = rows[0]?.[columnIndex];
    if (isYear(cell)) {
      currentYear = Number(cell);
    }
    years[columnIndex] = currentYear;
  }

  let currentMonth: number | null = null;
  for (let columnIndex = 0; columnIndex < maxCols; columnIndex++) {
    const cell = rows[1]?.[columnIndex];
    const month = getMonthNumber(cell);
    if (month !== null) {
      currentMonth = month;
    }
    months[columnIndex] = currentMonth;
  }

  let nextYear: number | null = null;
  for (let columnIndex = maxCols - 1; columnIndex >= 0; columnIndex--) {
    if (years[columnIndex] !== null) {
      nextYear = years[columnIndex];
    } else if (nextYear !== null) {
      years[columnIndex] = nextYear;
    }
  }

  let nextMonth: number | null = null;
  for (let columnIndex = maxCols - 1; columnIndex >= 0; columnIndex--) {
    if (months[columnIndex] !== null) {
      nextMonth = months[columnIndex];
    } else if (nextMonth !== null) {
      months[columnIndex] = nextMonth;
    }
  }

  let lastColumnIndex = maxCols - 1;
  for (let columnIndex = 0; columnIndex < maxCols; columnIndex++) {
    const tagCell = rows[2]?.[columnIndex];
    if (
      typeof tagCell === "string" &&
      ["date", "day"].includes(tagCell.trim().toLowerCase())
    ) {
      lastColumnIndex = columnIndex - 1;
      break;
    }
  }

  return { years, months, lastColumnIndex };
}
function buildMonthGridColumnPoints(
  rows: unknown[][],
  columnIndex: number,
): NumericPoint[] {
  const points: NumericPoint[] = [];

  for (let rowIndex = 3; rowIndex < rows.length; rowIndex++) {
    const value = toNumber(rows[rowIndex]?.[columnIndex]);
    if (value === null) {
      continue;
    }

    points.push({
      rowNumber: rowIndex - 2,
      sheetRowIndex: rowIndex,
      value,
    });
  }

  return points;
}
function findMonthGridMatches(
  sheetName: string,
  rows: unknown[][],
  sequence: number[],
): PatternMatch[] {
  const matches: PatternMatch[] = [];
  const { years, months, lastColumnIndex } = fillMonthGridHeaders(rows);

  for (let columnIndex = 0; columnIndex <= lastColumnIndex; columnIndex++) {
    const year = years[columnIndex];
    const month = months[columnIndex];

    if (year === null || month === null) {
      continue;
    }

    const points = buildMonthGridColumnPoints(rows, columnIndex);
    if (points.length < 5) {
      continue;
    }

    const fixedMatch = findFixedGapMatch(points, sequence);
    const growingMatch = fixedMatch ? null : findGrowingGapMatch(points, sequence);
    const decreasingMatch =
      fixedMatch || growingMatch ? null : findDecreasingGapMatch(points, sequence);
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
      sheetName,
      columnIndex,
      nextRow: foundMatch.nextRow,
      label: formatDateParts(year, month, foundMatch.nextRow),
      value: foundMatch.value,
      matchType,
    });
  }

  return matches;
}
function findWorkbookMatches(
  workbook: XLSX.WorkBook,
  sequence: number[],
): PatternMatch[] {
  const matches: PatternMatch[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: null,
      raw: true,
    }) as unknown[][];

    if (looksLikeMonthGrid(rows)) {
      matches.push(...findMonthGridMatches(sheetName, rows, sequence));
      continue;
    }
    const headerOffset = isHeaderRow(rows[0]) ? 1 : 0;
    const labelColumn = findLabelColumn(rows, headerOffset);
    const maxCols = getMaxColumnCount(rows);

    for (let columnIndex = 0; columnIndex < maxCols; columnIndex++) {
      if (columnIndex === labelColumn) {
        continue;
      }
      const points = buildColumnPoints(rows, columnIndex, headerOffset);
      if (points.length < 5) {
        continue;
      }
      const fixedMatch = findFixedGapMatch(points, sequence);
      const growingMatch = fixedMatch ? null : findGrowingGapMatch(points, sequence);
      const decreasingMatch =
        fixedMatch || growingMatch ? null : findDecreasingGapMatch(points, sequence);
      const foundMatch = fixedMatch ?? growingMatch ?? decreasingMatch;

      if (!foundMatch) {
        continue;
      }

      const matchType = fixedMatch
        ? "fixed-gap"
        : growingMatch
          ? "growing-gap"
          : "decreasing-gap";

      const sheetRowIndex = headerOffset + foundMatch.nextRow - 1;
      const labelCell =
        labelColumn === null ? null : rows[sheetRowIndex]?.[labelColumn];

      matches.push({
        sheetName,
        columnIndex,
        nextRow: foundMatch.nextRow,
        label: formatLabel(labelCell, foundMatch.nextRow),
        value: foundMatch.value,
        matchType,
      });
    }
  }

  return matches;
}
function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(8)));
}
function buildAnswer(matches: PatternMatch[]): string {
  if (matches.length === 0) {
    return "Ye pattern nhi mila";
  }

  const visibleMatches = matches.slice(0, 5);
  const lines = visibleMatches.map(
    (match) => `${match.label} - ${formatNumber(match.value)}`,
  );

  return [`Ye pattern ${visibleMatches.length} jgh mila hai :`, ...lines].join("\n");
}
export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const file = formData.get("file") as File;
    if (!file)
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    const sequenceInput = String(
      formData.get("sequence") ?? formData.get("text") ?? "",
    ).trim();
    const querySequence = extractNumericSequence(sequenceInput);

    if (querySequence.length !== 4) {
      return NextResponse.json(
        {
          success: false,
          message: "Exactly 4 numbers provide karo",
        },
        { status: 400 },
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const matches = findWorkbookMatches(workbook, querySequence);
    const answer = buildAnswer(matches);

    return NextResponse.json({
      success: true,
      message: "File uploaded successfully",
      sequence: querySequence,
      sheets: workbook.SheetNames,
      answer,
    });
  } catch (e) {
    logger.error("Upload failed", e);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
