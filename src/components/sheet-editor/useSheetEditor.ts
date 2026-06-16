'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  useCreateSheetDataMutation,
  useDataSourcesQuery,
  useUpdateSheetDataMutation,
} from '@/components/sheet-editor/sheet-editor-queries';
import {
  DEFAULT_ENTRY_COLUMNS,
  DEFAULT_FILTERS,
  EMPTY_METADATA,
} from '@/components/sheet-editor/sheet-editor-config';
import {
  getTodayDateValue,
  validateFilters,
} from '@/components/sheet-editor/sheet-editor-date';
import type { FilterState } from '@/components/sheet-editor/sheet-editor-types';
import {
  createChangedRowPayload,
  createDrafts,
  getColumns,
  getRowId,
  getRowKey,
  type DataSourceRecord,
  type RowDraft,
} from '@/components/sheet-editor/sheet-editor-utils';
import { ApiClientError } from '@/lib/api-client';
import { clearStoredAuth } from '@/lib/auth-client';

const EMPTY_ROWS: DataSourceRecord[] = [];
const EMPTY_NUMBERS: number[] = [];
const YEAR_MODE_LIMIT = 5000;

function dedupeAndSortNumbers(values: number[], descending: boolean) {
  return [...new Set(values.filter((value) => Number.isFinite(value)))]
    .sort((left, right) => (descending ? right - left : left - right));
}

function extractFilterValuesFromRows(rows: DataSourceRecord[]) {
  const years = new Set<number>();
  const months = new Set<number>();

  for (const row of rows) {
    const rawDate = row.date;
    if (typeof rawDate !== 'string') {
      continue;
    }

    const match = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      continue;
    }

    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);

    if (Number.isFinite(year)) {
      years.add(year);
    }

    if (Number.isFinite(month)) {
      months.add(month);
    }
  }

  return {
    years: dedupeAndSortNumbers(Array.from(years), true),
    months: dedupeAndSortNumbers(Array.from(months), false),
  };
}

function createEmptyDraft(columns: string[]) {
  return columns.reduce<RowDraft>((draft, column) => {
    draft[column] = column.toLowerCase() === 'date' ? getTodayDateValue() : '';
    return draft;
  }, {});
}

function buildCreatePayload(draft: RowDraft) {
  return Object.entries(draft).reduce<RowDraft>(
    (payload, [key, value]) => {
      if (key.toLowerCase() === 'date' || value.trim()) {
        payload[key] = value;
      }

      return payload;
    },
    { date: draft.date || getTodayDateValue() },
  );
}

export function useSheetEditor() {
  const router = useRouter();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<FilterState>(DEFAULT_FILTERS);
  const [draftRows, setDraftRows] = useState<Record<string, RowDraft>>({});
  const [isAddingRow, setIsAddingRow] = useState(false);
  const [newRowDraft, setNewRowDraft] = useState<RowDraft>({});
  const [savingRowKey, setSavingRowKey] = useState<string | null>(null);
  const filterError = useMemo(() => validateFilters(filters), [filters]);
  const dataSourcesQuery = useDataSourcesQuery(appliedFilters, !filterError);
  const allYearsQueryFilters = useMemo(
    () => ({
      ...DEFAULT_FILTERS,
      year: '',
      month: '',
      search: '',
      startDate: '',
      endDate: '',
      limit: YEAR_MODE_LIMIT,
      page: 1,
    }),
    [],
  );
  const allYearsQuery = useDataSourcesQuery(allYearsQueryFilters, !filterError);
  const createSheetDataMutation = useCreateSheetDataMutation();
  const updateSheetDataMutation = useUpdateSheetDataMutation();
  const rows = dataSourcesQuery.data?.rows ?? EMPTY_ROWS;
  const metadata = dataSourcesQuery.data?.metadata ?? EMPTY_METADATA;
  const metadataAvailableYears = metadata.availableYears;
  const metadataAvailableMonths = metadata.availableMonths;
  const catalogAvailableYears =
    allYearsQuery.data?.metadata.availableYears ?? EMPTY_NUMBERS;
  const catalogAvailableMonths =
    allYearsQuery.data?.metadata.availableMonths ?? EMPTY_NUMBERS;

  const isLoading =
    !filterError && (dataSourcesQuery.isLoading || dataSourcesQuery.isFetching);
  const errorMessage =
    dataSourcesQuery.error instanceof Error
      ? dataSourcesQuery.error.message
      : dataSourcesQuery.error
        ? 'Could not load spreadsheet data.'
        : '';

  const columns = useMemo(() => getColumns(rows), [rows]);
  const entryColumns = useMemo(() => {
    const visibleColumns = columns.length > 0 ? columns : DEFAULT_ENTRY_COLUMNS;
    return [
      'date',
      ...visibleColumns.filter((column) => column.toLowerCase() !== 'date'),
    ];
  }, [columns]);
  const isYearFilterActive = appliedFilters.year.trim().length > 0;
  const canPage = isYearFilterActive
    ? false
    : (metadata.totalPages ?? 0) > 1 || rows.length >= appliedFilters.limit;
  const canGoNext = isYearFilterActive
    ? false
    : metadata.totalPages !== null
      ? appliedFilters.page < metadata.totalPages
      : rows.length >= appliedFilters.limit;
  const canSaveNewRow = Object.entries(newRowDraft).some(
    ([key, value]) => key.toLowerCase() !== 'date' && value.trim(),
  );

  const availableFilters = useMemo(() => {
    const fallback = extractFilterValuesFromRows(rows);
    const nextYears =
      catalogAvailableYears.length > 0
        ? catalogAvailableYears
        : metadataAvailableYears.length > 0
          ? metadataAvailableYears
          : fallback.years;
    const nextMonths =
      metadataAvailableMonths.length > 0
        ? metadataAvailableMonths
        : catalogAvailableMonths.length > 0
          ? catalogAvailableMonths
          : fallback.months;

    const nextYearsDeduped = dedupeAndSortNumbers(
      nextYears.length > 0 ? nextYears : [],
      true,
    );
    const nextMonthsDeduped = dedupeAndSortNumbers(
      nextMonths.length > 0 ? nextMonths : [],
      false,
    );

    return {
      years: nextYearsDeduped,
      months: nextMonthsDeduped,
    };
  }, [
    rows,
    metadataAvailableMonths,
    metadataAvailableYears,
    catalogAvailableMonths,
    catalogAvailableYears,
  ]);
  const availableYears = availableFilters.years;
  const availableMonths = availableFilters.months;

  useEffect(() => {
    if (filterError) {
      return;
    }

    const normalizedYear = filters.year.trim();
    const fallbackYear = availableYears.length > 0 ? String(availableYears[0]) : '';
    const nextFilters: FilterState = { ...filters };
    let shouldSync = false;

    if (!normalizedYear && fallbackYear) {
      nextFilters.year = fallbackYear;
      shouldSync = true;
    }

    if (
      normalizedYear.length > 0 &&
      !availableYears.includes(Number(normalizedYear))
    ) {
      nextFilters.year = fallbackYear;
      shouldSync = true;
    }

    if (nextFilters.month.trim().length > 0) {
      nextFilters.month = '';
      shouldSync = true;
    }

    if (nextFilters.limit !== YEAR_MODE_LIMIT) {
      nextFilters.limit = YEAR_MODE_LIMIT;
      shouldSync = true;
    }

    if (
      shouldSync &&
      (nextFilters.page !== 1 || nextFilters.year !== filters.year)
    ) {
      nextFilters.page = 1;
      shouldSync = true;
    }

    if (shouldSync) {
      const timeoutId = window.setTimeout(() => setFilters(nextFilters), 0);
      return () => window.clearTimeout(timeoutId);
    }
  }, [availableYears, filterError, filters]);

  useEffect(() => {
    if (filterError) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setAppliedFilters((current) => {
        if (
          current.year === filters.year &&
          current.month === filters.month &&
          current.search === filters.search &&
          current.startDate === filters.startDate &&
          current.endDate === filters.endDate &&
          current.limit === filters.limit &&
          current.page === filters.page
        ) {
          return current;
        }

        return filters;
      });
    }, 350);
    return () => window.clearTimeout(timeoutId);
  }, [filterError, filters]);

  useEffect(() => {
    if (!dataSourcesQuery.data) {
      return;
    }

    const nextRows = dataSourcesQuery.data.rows;
    const timeoutId = window.setTimeout(() => {
      setDraftRows(createDrafts(nextRows, getColumns(nextRows)));
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [dataSourcesQuery.data]);
  useEffect(() => {
    const error = dataSourcesQuery.error;
    if (error instanceof ApiClientError && error.status === 401) {
      clearStoredAuth();
      router.push('/login');
    }
  }, [dataSourcesQuery.error, router]);

  function updateFilter<K extends keyof FilterState>(
    key: K,
    value: FilterState[K],
  ) {
    setFilters((current) => {
      if (current[key] === value && current.month === '' && current.page === 1) {
        return current;
      }

      const next = {
        ...current,
        [key]: value,
        month: '',
        page: 1,
      };

      if (key === 'year') {
        next.limit = YEAR_MODE_LIMIT;
      }

      return next as FilterState;
    });
  }

  function resetFilters() {
    setFilters({
      ...DEFAULT_FILTERS,
      year: '',
      limit: YEAR_MODE_LIMIT,
      page: 1,
    });
  }

  function refreshRows() {
    void dataSourcesQuery.refetch();
  }
  function setPage(page: number) {
    setFilters((current) => {
      if (current.page === page) {
        return current;
      }

      return {
        ...current,
        page,
      };
    });
  }

  function updateDraftCell(rowKey: string, column: string, value: string) {
    setDraftRows((current) => ({
      ...current,
      [rowKey]: {
        ...current[rowKey],
        [column]: value,
      },
    }));
  }

  function handleUnauthorizedSave(error: unknown) {
    if (error instanceof ApiClientError && error.status === 401) {
      clearStoredAuth();
      router.push('/login');
      return true;
    }

    return false;
  }

  async function saveRow(row: DataSourceRecord, rowIndex: number) {
    const rowKey = getRowKey(row, rowIndex);
    const rowId = getRowId(row);
    const draft = draftRows[rowKey];

    if (!draft) {
      return;
    }

    if (!rowId) {
      toast.error('Row cannot be updated.', {
        description: 'Missing sheet row id.',
      });
      return;
    }

    const payload = createChangedRowPayload(row, draft);

    if (Object.keys(payload).length === 0) {
      return;
    }

    setSavingRowKey(rowKey);

    try {
      await updateSheetDataMutation.mutateAsync({ id: rowId, payload });
      toast.success('Row updated.');
      await dataSourcesQuery.refetch();
    } catch (error) {
      if (handleUnauthorizedSave(error)) {
        return;
      }

      toast.error('Row update failed.', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSavingRowKey(null);
    }
  }

  function setEntryDialogOpen(open: boolean) {
    if (open) {
      setNewRowDraft(createEmptyDraft(entryColumns));
      setIsAddingRow(true);
      return;
    }

    setIsAddingRow(false);
    setNewRowDraft({});
  }

  function updateNewRowCell(column: string, value: string) {
    setNewRowDraft((current) => ({
      ...current,
      [column]: value,
    }));
  }

  async function saveNewRow() {
    const payload = buildCreatePayload(newRowDraft);

    try {
      await createSheetDataMutation.mutateAsync(payload);
      setIsAddingRow(false);
      setNewRowDraft({});
      toast.success('Entry created.');
      await dataSourcesQuery.refetch();
    } catch (error) {
      if (handleUnauthorizedSave(error)) {
        return;
      }

      toast.error('Entry creation failed.', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  }

  async function saveRowPayload(payload: RowDraft) {
    try {
      await createSheetDataMutation.mutateAsync(payload);
      toast.success('Entry created.');
      await dataSourcesQuery.refetch();
    } catch (error) {
      if (handleUnauthorizedSave(error)) {
        return;
      }

      toast.error('Entry creation failed.', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  }

  return {
    filters,
    appliedFilters,
    rows,
    draftRows,
    metadata,
    columns,
    entryColumns,
    newRowDraft,
    savingRowKey,
    isAddingRow,
    isCreatingRow: createSheetDataMutation.isPending,
    isLoading,
    errorMessage,
    filterError,
    canPage,
    canGoNext,
    canSaveNewRow,
    availableYears,
    availableMonths,
    updateFilter,
    resetFilters,
    refreshRows,
    setPage,
    updateDraftCell,
    saveRow,
    saveRowPayload,
    setEntryDialogOpen,
    updateNewRowCell,
    saveNewRow,
  };
}
