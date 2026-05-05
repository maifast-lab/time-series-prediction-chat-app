'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  buildDataSourcesPath,
  createSheetData,
  updateSheetData,
} from '@/components/sheet-editor/sheet-editor-api';
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
  formatCellValue,
  getColumns,
  getRowId,
  getRowKey,
  normalizeDataSourceRows,
  normalizeDataSourcesMetadata,
  type DataSourceRecord,
  type RowDraft,
} from '@/components/sheet-editor/sheet-editor-utils';
import { ApiClientError, requestApi } from '@/lib/api-client';
import { clearStoredAuth } from '@/lib/auth-client';

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

function isRecord(value: unknown): value is DataSourceRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function useSheetEditor() {
  const router = useRouter();
  const requestIdRef = useRef(0);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<FilterState>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<DataSourceRecord[]>([]);
  const [draftRows, setDraftRows] = useState<Record<string, RowDraft>>({});
  const [metadata, setMetadata] = useState(EMPTY_METADATA);
  const [isAddingRow, setIsAddingRow] = useState(false);
  const [newRowDraft, setNewRowDraft] = useState<RowDraft>({});
  const [savingRowKey, setSavingRowKey] = useState<string | null>(null);
  const [isCreatingRow, setIsCreatingRow] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [filterError, setFilterError] = useState('');

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

  const loadDataSources = useCallback(async (nextFilters: FilterState) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    setErrorMessage('');

    try {
      const payload = await requestApi<unknown>(buildDataSourcesPath(nextFilters));

      if (requestId !== requestIdRef.current) {
        return;
      }

      const nextRows = normalizeDataSourceRows(payload);
      const nextColumns = getColumns(nextRows);

      setRows(nextRows);
      setDraftRows(createDrafts(nextRows, nextColumns));
      setMetadata(normalizeDataSourcesMetadata(payload));
      setAppliedFilters(nextFilters);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        clearStoredAuth();
        router.push('/login');
        return;
      }

      if (requestId !== requestIdRef.current) {
        return;
      }

      setRows([]);
      setDraftRows({});
      setMetadata(EMPTY_METADATA);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Could not load spreadsheet data.',
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [router]);

  useEffect(() => {
    const validationError = validateFilters(filters);
    setFilterError(validationError);

    if (validationError) {
      setIsLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadDataSources(filters);
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [filters, loadDataSources]);

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
    void loadDataSources(appliedFilters);
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
      await updateSheetData(rowId, payload);
      toast.success('Row updated.');
      await loadDataSources(appliedFilters);
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
    setIsCreatingRow(true);

    try {
      const response = await createSheetData(payload);
      const persistedRow =
        isRecord(response) && Object.keys(response).length > 0
          ? response
          : {
              __rowKey: `new-${Date.now()}`,
              ...payload,
            };

      setRows((currentRows) => [...currentRows, persistedRow]);
      setDraftRows((currentDrafts) => ({
        ...currentDrafts,
        [getRowKey(persistedRow, rows.length)]: Object.fromEntries(
          Object.entries(persistedRow).map(([key, value]) => [
            key,
            formatCellValue(value),
          ]),
        ),
      }));
      setIsAddingRow(false);
      setNewRowDraft({});
      toast.success('Entry created.');
      await loadDataSources(appliedFilters);
    } catch (error) {
      if (handleUnauthorizedSave(error)) {
        return;
      }

      toast.error('Entry creation failed.', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setIsCreatingRow(false);
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
    isCreatingRow,
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
