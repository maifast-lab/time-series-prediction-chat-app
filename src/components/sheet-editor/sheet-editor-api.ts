import type { FilterState } from '@/components/sheet-editor/sheet-editor-types';
import { requestApi } from '@/lib/api-client';

export function buildDataSourcesPath(filters: FilterState) {
  const params = new URLSearchParams();
  const search = filters.search.trim();
  const year = filters.year.trim();
  const month = filters.month.trim();

  if (search) {
    params.set('search', search);
  }

  params.set('page', String(filters.page));
  params.set('limit', String(filters.limit));

  if (year) {
    params.set('year', year);
  }

  if (month) {
    params.set('month', month);
  }

  if (filters.startDate) {
    params.set('startDate', filters.startDate);
  }

  if (filters.endDate) {
    params.set('endDate', filters.endDate);
  }

  const query = params.toString();
  return query ? `/api/data-sources?${query}` : '/api/data-sources';
}

export function createSheetData(payload: Record<string, string>) {
  return requestApi<unknown>('/api/sheet-data', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export function updateSheetData(id: string, payload: Record<string, string>) {
  return requestApi<unknown>(`/api/sheet-data/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}
