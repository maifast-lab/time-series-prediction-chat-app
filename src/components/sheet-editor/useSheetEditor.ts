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
  const [filterError, setFilterError] = useState('');
  const dataSourcesQuery = useDataSourcesQuery(appliedFilters, !filterError);
  const createSheetDataMutation = useCreateSheetDataMutation();
  const updateSheetDataMutation = useUpdateSheetDataMutation();
  const rows = dataSourcesQuery.data?.rows ?? EMPTY_ROWS;
  const metadata = dataSourcesQuery.data?.metadata ?? EMPTY_METADATA;
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
  const canPage =
    (metadata.totalPages ?? 0) > 1 || rows.length >= appliedFilters.limit;
  const canGoNext =
    metadata.totalPages !== null
      ? appliedFilters.page < metadata.totalPages
      : rows.length >= appliedFilters.limit;
  const canSaveNewRow = Object.entries(newRowDraft).some(
    ([key, value]) => key.toLowerCase() !== 'date' && value.trim(),
  );

  useEffect(() => {
    const validationError = validateFilters(filters);
    setFilterError(validationError);

    if (validationError) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setAppliedFilters(filters);
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [filters]);

  useEffect(() => {
    if (!dataSourcesQuery.data) {
      return;
    }

    const nextRows = dataSourcesQuery.data.rows;
    setDraftRows(createDrafts(nextRows, getColumns(nextRows)));
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
    setFilters((current) => ({
      ...current,
      [key]: value,
      page: 1,
    }));
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  function refreshRows() {
    void dataSourcesQuery.refetch();
  }

  function setPage(page: number) {
    setFilters({ ...appliedFilters, page });
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
    updateFilter,
    resetFilters,
    refreshRows,
    setPage,
    updateDraftCell,
    saveRow,
    setEntryDialogOpen,
    updateNewRowCell,
    saveNewRow,
  };
}
