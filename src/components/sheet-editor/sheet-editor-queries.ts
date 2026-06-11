'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import {
  buildDataSourcesPath,
  createSheetData,
  updateSheetData,
} from '@/components/sheet-editor/sheet-editor-api';
import { DEFAULT_FILTERS } from '@/components/sheet-editor/sheet-editor-config';
import type { FilterState } from '@/components/sheet-editor/sheet-editor-types';
import {
  normalizeDataSourceRows,
  normalizeDataSourcesMetadata,
  type DataSourceRecord,
  type DataSourcesMetadata,
  type RowDraft,
} from '@/components/sheet-editor/sheet-editor-utils';
import { requestApi } from '@/lib/api-client';
import {
  cleanUploadedData,
  createDataSourceRequest,
} from '@/lib/data-source-client';

export interface DataSourcesQueryData {
  rows: DataSourceRecord[];
  metadata: DataSourcesMetadata;
  payload: unknown;
}

interface SheetDataStatus {
  hasSheetData: boolean;
  totalRows: number;
  loadedRows: number;
}

interface UploadDataSourceInput {
  file: File;
  onCleaned?: () => void;
}

export const sheetDataQueryKeys = {
  all: ['sheet-data'] as const,
  status: () => [...sheetDataQueryKeys.all, 'status'] as const,
  dataSources: (filters: FilterState) =>
    [...sheetDataQueryKeys.all, 'data-sources', filters] as const,
};

function markSheetDataAvailable(queryClient: QueryClient) {
  queryClient.setQueryData<SheetDataStatus>(
    sheetDataQueryKeys.status(),
    (current) => ({
      hasSheetData: true,
      totalRows: Math.max(current?.totalRows ?? 1, 1),
      loadedRows: Math.max(current?.loadedRows ?? 1, 1),
    }),
  );
}

export async function fetchDataSources(
  filters: FilterState,
): Promise<DataSourcesQueryData> {
  const payload = await requestApi<unknown>(buildDataSourcesPath(filters));

  return {
    payload,
    rows: normalizeDataSourceRows(payload),
    metadata: normalizeDataSourcesMetadata(payload),
  };
}

export async function fetchSheetDataStatus(): Promise<SheetDataStatus> {
  const result = await fetchDataSources({
    ...DEFAULT_FILTERS,
    page: 1,
    limit: 1,
  });
  const totalRows = result.metadata.total ?? result.rows.length;

  return {
    hasSheetData: totalRows > 0,
    totalRows,
    loadedRows: result.rows.length,
  };
}

export function useDataSourcesQuery(filters: FilterState, enabled: boolean) {
  return useQuery({
    queryKey: sheetDataQueryKeys.dataSources(filters),
    queryFn: () => fetchDataSources(filters),
    enabled,
  });
}

export function useSheetDataStatus(enabled: boolean) {
  return useQuery({
    queryKey: sheetDataQueryKeys.status(),
    queryFn: fetchSheetDataStatus,
    enabled,
    staleTime: 10_000,
  });
}

export function useCreateSheetDataMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: RowDraft) => createSheetData(payload),
    onSuccess: () => {
      markSheetDataAvailable(queryClient);
      void queryClient.invalidateQueries({ queryKey: sheetDataQueryKeys.all });
    },
  });
}

export function useUpdateSheetDataMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RowDraft }) =>
      updateSheetData(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sheetDataQueryKeys.all });
    },
  });
}

export function useUploadDataSourceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ file, onCleaned }: UploadDataSourceInput) => {
      const formData = new FormData();
      formData.append('file', file);

      const cleanedData = await cleanUploadedData(formData);
      onCleaned?.();

      const dataSourceRequest = createDataSourceRequest(cleanedData);

      await requestApi<unknown>('/api/data-sources', {
        method: 'POST',
        headers: dataSourceRequest.headers,
        body: dataSourceRequest.body,
      });

      return {
        fileName: file.name,
      };
    },
    onSuccess: () => {
      markSheetDataAvailable(queryClient);
      void queryClient.invalidateQueries({ queryKey: sheetDataQueryKeys.all });
    },
  });
}
