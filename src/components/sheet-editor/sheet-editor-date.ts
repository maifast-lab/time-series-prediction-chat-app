import { format, isValid } from 'date-fns';

import type { FilterState } from '@/components/sheet-editor/sheet-editor-types';

export function isDateColumn(column: string) {
  return column.toLowerCase() === 'date';
}

export function parseDateValue(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return undefined;
  }

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));

  return isValid(date) ? date : undefined;
}

export function formatDateValue(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

export function getTodayDateValue() {
  return formatDateValue(new Date());
}

export function validateFilters(filters: FilterState) {
  if (filters.month && !filters.year.trim()) {
    return 'Choose a year before filtering by month.';
  }

  if (
    filters.startDate &&
    filters.endDate &&
    filters.startDate > filters.endDate
  ) {
    return 'Start date must be before end date.';
  }

  return '';
}
