import { parse } from 'csv-parse/sync';

export interface CsvRow {
  date: string;
  value: number;
}

export interface ValidationResult {
  isValid: boolean;
  frequencyDays?: number;
  data?: CsvRow[];
  error?: string;
}

/**
 * Validates CSV structure and content strict adherence to spec.
 * - Header must be "date,value"
 * - No empty rows, no nulls
 * - Dates must be ISO 8601 YYYY-MM-DD
 * - Values must be finite numbers
 * - No duplicate dates within the CSV
 */
function parseAndValidateStructure(fileContent: string): {
  data?: CsvRow[];
  error?: string;
} {
  try {
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: false, // Strict rule: No empty rows allowed (except trailing maybe, but we check)
      trim: true,
    });

    // Check header implicitly via columns: true, but we need to ensure *only* date,value exist and are named correctly.
    // However, csv-parse with columns: true uses the first line as keys.
    // If the header is wrong, the keys will be wrong.

    // Let's do a raw parse of the first line to check header EXACTLY
    const lines = fileContent.trim().split(/\r?\n/);
    if (lines.length < 2)
      return { error: 'CSV must have a header and at least one data row.' };

    if (lines[0].trim() !== 'date,value') {
      return { error: 'Header must be exactly "date,value"' };
    }

    const typedData: CsvRow[] = [];
    const dateSet = new Set<string>();

    for (const [index, row] of (records as any[]).entries()) {
      // row is { date: '...', value: '...' }

      // Check for extra columns or missing columns is handled by 'columns: true' mostly, but let's be safe
      if (!('date' in row) || !('value' in row)) {
        return { error: `Row ${index + 1}: Missing required columns.` };
      }

      const dateStr = String(row.date);
      const valueStr = row.value;

      // 1. Check for empty
      if (
        !dateStr ||
        valueStr === '' ||
        valueStr === undefined ||
        valueStr === null
      ) {
        return { error: `Row ${index + 1}: Contains empty values.` };
      }

      // 2. Validate Date Format YYYY-MM-DD
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return {
          error: `Row ${
            index + 1
          }: Invalid date format "${dateStr}". Expected YYYY-MM-DD.`,
        };
      }

      const dateObj = new Date(dateStr);
      if (isNaN(dateObj.getTime())) {
        return { error: `Row ${index + 1}: Invalid date "${dateStr}".` };
      }

      // 3. Validate Value is Number
      const val = Number(valueStr);
      if (!Number.isFinite(val)) {
        return {
          error: `Row ${
            index + 1
          }: Value "${valueStr}" is not a finite number.`,
        };
      }

      // 4. Duplicate Check in CSV
      if (dateSet.has(dateStr)) {
        return { error: `Duplicate date found in CSV: ${dateStr}` };
      }
      dateSet.add(dateStr);

      typedData.push({ date: dateStr, value: val });
    }

    return { data: typedData };
  } catch (err) {
    return { error: `CSV Parsing Failed: ${(err as Error).message}` };
  }
}

/**
 * Validates frequency consistency.
 * - Sort dates
 * - Compute deltas
 * - All deltas must be equal and positive
 */
function validateFrequency(data: CsvRow[]): {
  valid: boolean;
  frequency?: number;
  error?: string;
} {
  if (data.length < 2) {
    // If only 1 point, we can't establish frequency.
    // Spec implies we need to detect it.
    // If this is the VERY FIRST upload for a chat, maybe we assume daily? OR we require at least 2 points?
    // Spec says: "Detect Series Frequency... delta[0]"
    // If data.length < 2, delta is undefined.
    // We will reject single-row CSVs for INITIAL setup if stricter logic is needed,
    // BUT for incremental it matches existing.
    // Let's assume for Frequency detection we need >= 2 points.
    return {
      valid: false,
      error: 'Need at least 2 data points to establish frequency.',
    };
  }

  // Sort by date
  const sorted = [...data].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const deltas: number[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const d1 = new Date(sorted[i - 1].date);
    const d2 = new Date(sorted[i].date);

    // Difference in days
    const diffTime = Math.abs(d2.getTime() - d1.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    deltas.push(diffDays);
  }

  // Rule: All deltas must be positive
  if (deltas.some((d) => d <= 0)) {
    return {
      valid: false,
      error:
        'Dates must be strictly increasing (found duplicate or unordered after sort).',
    };
  }

  // Rule: All deltas must be equal
  const firstDelta = deltas[0];
  if (deltas.some((d) => d !== firstDelta)) {
    return {
      valid: false,
      error: `Invalid date series. Expected consistent interval of ${firstDelta} days but found gaps: [${deltas
        .slice(0, 5)
        .join(', ')}...]`,
    };
  }

  return { valid: true, frequency: firstDelta };
}

export function validateCsv(fileContent: string): ValidationResult {
  const structureRes = parseAndValidateStructure(fileContent);
  if (structureRes.error) {
    return { isValid: false, error: structureRes.error };
  }

  const data = structureRes.data!;

  // Frequency Check
  const freqRes = validateFrequency(data);
  if (!freqRes.valid) {
    return { isValid: false, error: freqRes.error };
  }

  return { isValid: true, frequencyDays: freqRes.frequency, data: data };
}
