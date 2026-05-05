export type DataSourceRecord = Record<string, unknown>;
export type RowDraft = Record<string, string>;

export interface DataSourcesMetadata {
  total: number | null;
  page: number | null;
  limit: number | null;
  totalPages: number | null;
}

const ROW_CANDIDATE_KEYS = [
  'dataSources',
  'data_sources',
  'items',
  'rows',
  'results',
  'records',
  'data',
];

const TOTAL_CANDIDATE_KEYS = ['total', 'totalCount', 'count'];
const PAGE_CANDIDATE_KEYS = ['page', 'currentPage'];
const LIMIT_CANDIDATE_KEYS = ['limit', 'pageSize', 'perPage'];
const TOTAL_PAGES_CANDIDATE_KEYS = ['totalPages', 'pages', 'pageCount'];
const METADATA_CONTAINER_KEYS = ['pagination', 'meta', 'metadata'];

const PRIORITY_COLUMNS = [
  'date',
  'year',
  'month',
  'fileName',
  'name',
  'value',
];

const HIDDEN_COLUMN_KEYS = new Set([
  '_id',
  'id',
  'createdAt',
  'created_at',
  'updatedAt',
  'updated_at',
]);

function isRecord(value: unknown): value is DataSourceRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isHiddenColumn(column: string) {
  return HIDDEN_COLUMN_KEYS.has(column) || column.startsWith('__');
}

function toRecord(value: unknown, index: number): DataSourceRecord {
  return isRecord(value) ? value : { row: index + 1, value };
}

function readNumber(record: DataSourceRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function extractRows(payload: unknown): DataSourceRecord[] | null {
  if (Array.isArray(payload)) {
    return payload.map(toRecord);
  }

  if (!isRecord(payload)) {
    return null;
  }

  for (const key of ROW_CANDIDATE_KEYS) {
    const value = payload[key];

    if (Array.isArray(value)) {
      return value.map(toRecord);
    }

    if (isRecord(value)) {
      const nestedRows = extractRows(value);
      if (nestedRows !== null) {
        return nestedRows;
      }
    }
  }

  return null;
}

export function normalizeDataSourceRows(payload: unknown): DataSourceRecord[] {
  const rows = extractRows(payload);

  if (rows !== null) {
    return rows;
  }

  return isRecord(payload) && Object.keys(payload).length > 0 ? [payload] : [];
}

export function normalizeDataSourcesMetadata(
  payload: unknown,
): DataSourcesMetadata {
  if (!isRecord(payload)) {
    return {
      total: null,
      page: null,
      limit: null,
      totalPages: null,
    };
  }

  const directMetadata = {
    total: readNumber(payload, TOTAL_CANDIDATE_KEYS),
    page: readNumber(payload, PAGE_CANDIDATE_KEYS),
    limit: readNumber(payload, LIMIT_CANDIDATE_KEYS),
    totalPages: readNumber(payload, TOTAL_PAGES_CANDIDATE_KEYS),
  };

  if (Object.values(directMetadata).some((value) => value !== null)) {
    return directMetadata;
  }

  for (const key of METADATA_CONTAINER_KEYS) {
    const value = payload[key];

    if (isRecord(value)) {
      return normalizeDataSourcesMetadata(value);
    }
  }

  return directMetadata;
}

export function getColumns(rows: DataSourceRecord[]) {
  const columns = new Set<string>();

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!isHiddenColumn(key)) {
        columns.add(key);
      }
    }
  }

  return [...columns].sort((left, right) => {
    const leftIndex = PRIORITY_COLUMNS.indexOf(left);
    const rightIndex = PRIORITY_COLUMNS.indexOf(right);

    if (leftIndex !== -1 || rightIndex !== -1) {
      return (
        (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
        (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex)
      );
    }

    return left.localeCompare(right);
  });
}

export function getRowKey(row: DataSourceRecord, index: number) {
  const key = row.__rowKey ?? row._id ?? row.id ?? row.uuid ?? row.key;
  return key === undefined || key === null ? `row-${index}` : `row-${key}`;
}

export function getRowId(row: DataSourceRecord) {
  const id =
    row._id ??
    row.id ??
    row.sheetDataId ??
    row.sheet_data_id ??
    row.dataPointId ??
    row.data_point_id;
  return id === undefined || id === null ? null : String(id);
}

export function formatCellValue(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function createRowDraft(row: DataSourceRecord, columns: string[]) {
  return columns.reduce<RowDraft>((draft, column) => {
    draft[column] = formatCellValue(row[column]);
    return draft;
  }, {});
}

export function createDrafts(rows: DataSourceRecord[], columns: string[]) {
  return rows.reduce<Record<string, RowDraft>>((drafts, row, index) => {
    drafts[getRowKey(row, index)] = createRowDraft(row, columns);
    return drafts;
  }, {});
}

export function isRowDirty(row: DataSourceRecord, draft: RowDraft | undefined) {
  if (!draft) {
    return false;
  }

  return Object.entries(draft).some(
    ([key, value]) =>
      key.toLowerCase() !== 'date' && value !== formatCellValue(row[key]),
  );
}

export function createChangedRowPayload(
  row: DataSourceRecord,
  draft: RowDraft,
) {
  return Object.entries(draft).reduce<RowDraft>((payload, [key, value]) => {
    if (key.toLowerCase() !== 'date' && value !== formatCellValue(row[key])) {
      payload[key] = value;
    }

    return payload;
  }, {});
}
