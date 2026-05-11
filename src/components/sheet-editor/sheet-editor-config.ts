import type { FilterState } from '@/components/sheet-editor/sheet-editor-types';
import type { DataSourcesMetadata } from '@/components/sheet-editor/sheet-editor-utils';

export const DEFAULT_FILTERS: FilterState = {
  search: '',
  year: '',
  month: '',
  startDate: '',
  endDate: '',
  limit: 50,
  page: 1,
};

export const DEFAULT_ENTRY_COLUMNS = ['date', 'FB', 'GB', 'GL', 'DS'];
export const ROW_LIMIT_OPTIONS = [50, 100, 250, 500];

export const EMPTY_METADATA: DataSourcesMetadata = {
  total: null,
  page: null,
  limit: null,
  totalPages: null,
  availableYears: [],
  availableMonths: [],
};

export const MONTH_OPTIONS = [
  { value: '', label: 'All months' },
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];
