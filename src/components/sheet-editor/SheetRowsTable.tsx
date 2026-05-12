'use client';

import { Loader2, Save } from 'lucide-react';
import { useMemo } from 'react';

import CellEditor from '@/components/sheet-editor/CellEditor';
import { isDateColumn } from '@/components/sheet-editor/sheet-editor-date';
import {
  getRowKey,
  isRowDirty,
  type DataSourceRecord,
  type RowDraft,
} from '@/components/sheet-editor/sheet-editor-utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const MONTH_LABELS = [
  '',
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const SERIES_METRICS = ['FB', 'GB', 'GL', 'DS'];

const HIDDEN_ROW_KEYS = new Set([
  'id',
  '_id',
  'createdat',
  'created_at',
  'updatedat',
  'updated_at',
]);

interface AppliedFilters {
  year: string;
  month: string;
}

const FIXED_DAYS_IN_VIEW = 31;

interface MonthMetricCell {
  month: number;
  metric: string;
}

interface ParsedDate {
  year: number;
  month: number;
  day: number;
}

const parseDateParts = (value: unknown): ParsedDate | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  return { year, month, day };
};

interface SourceRow {
  row: DataSourceRecord;
  rowIndex: number;
  rowKey: string;
  draft: RowDraft;
  date: ParsedDate;
}

interface SheetRowsTableProps {
  columns: string[];
  rows: DataSourceRecord[];
  drafts: Record<string, RowDraft>;
  savingRowKey: string | null;
  appliedFilters: AppliedFilters;
  availableMonths: number[];
  onDraftChange: (rowKey: string, column: string, value: string) => void;
  onCreateRow: (payload: RowDraft) => void | Promise<void>;
  onSaveRow: (row: DataSourceRecord, rowIndex: number) => void;
}

export default function SheetRowsTable({
  columns,
  rows,
  drafts,
  savingRowKey,
  appliedFilters,
  availableMonths,
  onDraftChange,
  onCreateRow,
  onSaveRow,
}: SheetRowsTableProps) {
  const normalizeFieldId = (value: string) =>
    value
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-_:.]/g, '-');
  const selectedYear = Number.parseInt(appliedFilters.year, 10);
  const selectedMonth =
    Number.parseInt(appliedFilters.month, 10) > 0
      ? Number.parseInt(appliedFilters.month, 10)
      : null;
  const hasYearFilter = Number.isFinite(selectedYear) && selectedYear > 0;

  const displayedMonths = useMemo(() => {
    if (selectedMonth) {
      return [selectedMonth];
    }

    if (selectedYear > 0) {
      return availableMonths.length > 0
        ? availableMonths
        : (() => {
            const fallbackMonths = new Set<number>();

            for (const row of rows) {
              const parsed = parseDateParts(row.date);
              if (!parsed) {
                continue;
              }

              if (Number.isFinite(selectedYear) && parsed.year !== selectedYear) {
                continue;
              }

              fallbackMonths.add(parsed.month);
            }

            return [...fallbackMonths].sort((left, right) => left - right);
          })();
    }

    if (availableMonths.length > 0) {
      return availableMonths;
    }

    const fallbackMonths = new Set<number>();

    for (const row of rows) {
      const parsed = parseDateParts(row.date);
      if (parsed) {
        fallbackMonths.add(parsed.month);
      }
    }

    return [...fallbackMonths].sort((left, right) => left - right);
  }, [
    availableMonths,
    rows,
    selectedMonth,
    selectedYear,
  ]);

  const metricColumns = useMemo(() => {
    const visibleColumns = columns.filter((column) => {
      const key = column.toLowerCase();
      if (key === 'date') {
        return false;
      }
      if (HIDDEN_ROW_KEYS.has(key)) {
        return false;
      }
      return true;
    });
    const metricByKey = new Map<string, string>();
    for (const column of visibleColumns) {
      metricByKey.set(column.toLowerCase(), column);
    }
    const orderedSeriesColumns = SERIES_METRICS.flatMap((metric) => {
      const match = metricByKey.get(metric.toLowerCase());
      return match ? [match] : [];
    });

    const remainingColumns = visibleColumns.filter(
      (column) => !orderedSeriesColumns.includes(column),
    );

    return [...orderedSeriesColumns, ...remainingColumns];
  }, [columns]);

  const pivotColumns: MonthMetricCell[] = useMemo(
    () =>
      displayedMonths.flatMap((month) =>
        metricColumns.map((metric) => ({
          month,
          metric,
        })),
      ),
    [displayedMonths, metricColumns],
  );

  const sourceRows = useMemo(() => {
    const monthByDay = new Map<number, Map<number, SourceRow>>();

    rows.forEach((row, rowIndex) => {
      const parsed = parseDateParts(row.date);
      if (!parsed) {
        return;
      }

      if (Number.isFinite(selectedYear) && selectedYear > 0 && parsed.year !== selectedYear) {
        return;
      }

      if (selectedMonth && parsed.month !== selectedMonth) {
        return;
      }

      if (!displayedMonths.includes(parsed.month)) {
        return;
      }

      const rowKey = getRowKey(row, rowIndex);
      const draft = drafts[rowKey] ?? {};
      const monthEntries = monthByDay.get(parsed.month) ?? new Map<number, SourceRow>();

      monthEntries.set(parsed.day, {
        row,
        rowIndex,
        rowKey,
        draft,
        date: parsed,
      });
      monthByDay.set(parsed.month, monthEntries);
    });

    return monthByDay;
  }, [rows, selectedYear, selectedMonth, displayedMonths, drafts]);

  const dayRows = useMemo(() => {
    const createDaySeries = (count: number) =>
      [...Array(count)].map((_value, index) => index + 1);

    const days = new Set<number>();

    sourceRows.forEach((monthRows) => {
      monthRows.forEach((_record, day) => {
        days.add(day);
      });
    });

    if (selectedYear > 0 && selectedMonth) {
      return createDaySeries(
        new Date(selectedYear, selectedMonth, 0).getDate(),
      );
    }

    if (selectedYear > 0) {
      return createDaySeries(FIXED_DAYS_IN_VIEW);
    }

    if (sourceRows.size > 0) {
      return createDaySeries(FIXED_DAYS_IN_VIEW);
    }

    if (days.size > 0) {
      return [...days].sort((left, right) => left - right);
    }

    return [...Array(31).keys()].map((index) => index + 1);
  }, [selectedMonth, selectedYear, sourceRows]);

  const yearLabel =
    selectedYear > 0 ? `Year ${selectedYear}` : 'Year (all)';
  const yearHeaderStyle =
    selectedYear > 0
      ? (() => {
          const hue = (selectedYear * 41) % 360;
          return {
            backgroundColor: `hsl(${hue} 86% 90%)`,
            color: `hsl(${hue} 75% 24%)`,
            borderColor: `hsl(${hue} 70% 60%)`,
          };
        })()
      : null;
  const monthHeaderPalette = [
    'bg-red-100/85 text-red-900 dark:bg-red-900/45 dark:text-red-100 dark:border-red-400/25',
    'bg-yellow-100/80 text-yellow-900 dark:bg-yellow-900/45 dark:text-yellow-100 dark:border-yellow-400/25',
  ];

  const monthHeaderByIndex = new Map<number, string>();
  displayedMonths.forEach((month, monthIndex) => {
    monthHeaderByIndex.set(
      month,
      monthHeaderPalette[monthIndex % monthHeaderPalette.length],
    );
  });

  const isDayDirty = (day: number) => {
    for (const month of displayedMonths) {
      const sourceRow = sourceRows.get(month)?.get(day);
      if (sourceRow && isRowDirty(sourceRow.row, sourceRow.draft)) {
        return true;
      }

      const newRowKey = `__new-${selectedYear}-${month}-${day}`;
      const newRowDraft = drafts[newRowKey] ?? {};
      const hasNewRowValue = metricColumns.some((metric) => {
        const value = newRowDraft[metric];
        return typeof value === 'string' && value.trim() !== '';
      });
      if (hasNewRowValue) {
        return true;
      }
    }

    return false;
  };

  const isDaySaving = (day: number) => {
    for (const month of displayedMonths) {
      const sourceRow = sourceRows.get(month)?.get(day);
      if (sourceRow && savingRowKey === sourceRow.rowKey) {
        return true;
      }
    }

    return false;
  };

  const buildDateValue = (year: number, month: number, day: number) => {
    const monthValue = String(month).padStart(2, '0');
    const dayValue = String(day).padStart(2, '0');
    return `${year}-${monthValue}-${dayValue}`;
  };

  const isValidCalendarDate = (year: number, month: number, day: number) =>
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= new Date(year, month, 0).getDate();

  const buildNewRowPayload = (
    month: number,
    day: number,
  ): RowDraft | null => {
    if (!selectedYear || !isValidCalendarDate(selectedYear, month, day)) {
      return null;
    }

    const newRowKey = `__new-${selectedYear}-${month}-${day}`;
    const draft = drafts[newRowKey] ?? {};

    const payload: RowDraft = {
      date: buildDateValue(selectedYear, month, day),
    };
    let hasValue = false;

    for (const metric of metricColumns) {
      const value = draft[metric];

      if (value && value.trim()) {
        payload[metric] = value;
        hasValue = true;
      }
    }

    return hasValue ? payload : null;
  };

  const getSaveTargetsForDay = (day: number) => {
    const targets: SourceRow[] = [];
    const used = new Set<string>();

    for (const month of displayedMonths) {
      const sourceRow = sourceRows.get(month)?.get(day);
      if (sourceRow && !used.has(sourceRow.rowKey)) {
        targets.push(sourceRow);
        used.add(sourceRow.rowKey);
      }
    }

    return targets;
  };

  const getCreateTargetsForDay = (day: number) => {
    const targets: RowDraft[] = [];

    for (const month of displayedMonths) {
      const payload = buildNewRowPayload(month, day);
      if (payload) {
        targets.push(payload);
      }
    }

    return targets;
  };

  const handleSaveDay = (day: number) => {
    const targets = getSaveTargetsForDay(day);
    for (const target of targets) {
      void onSaveRow(target.row, target.rowIndex);
    }

    const createTargets = getCreateTargetsForDay(day);
    for (const payload of createTargets) {
      void onCreateRow(payload);
    }
  };

  return (
    <>
      {hasYearFilter ? (
        <div className='relative max-h-[80vh] overflow-x-auto overflow-y-auto'>
          <table className='w-max min-w-full border-collapse whitespace-nowrap text-left text-sm'>
            <thead className='sticky top-0 z-40 bg-white text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:bg-slate-950 dark:text-slate-400'>
              <tr>
                <th
                  rowSpan={3}
                  scope='col'
                  className='sticky left-0 top-0 z-30 border-b border-slate-200/80 bg-white px-4 py-3 font-semibold dark:border-white/10 dark:bg-slate-950'
                >
                  Day
                </th>
                <th
                  colSpan={Math.max(pivotColumns.length, 1)}
                  scope='col'
                  className='sticky top-0 z-20 border-b border-slate-200/80 bg-white px-4 py-3 text-center font-semibold dark:border-white/10'
                  style={yearHeaderStyle ?? undefined}
                >
                  {yearLabel}
                </th>
                <th
                  rowSpan={3}
                  scope='col'
                  className='sticky right-0 top-0 z-30 border-b border-slate-200/80 bg-white px-4 py-3 text-right font-semibold dark:border-white/10 dark:bg-slate-950'
                >
                  Action
                </th>
              </tr>
              <tr>
                {displayedMonths.length > 0 ? (
                  displayedMonths.map((month) => (
                    <th
                      key={`month-${month}`}
                      scope='col'
                      colSpan={Math.max(metricColumns.length, 1)}
                      className={`sticky top-0 z-20 border-b border-slate-200/80 px-4 py-2 text-center font-semibold ${monthHeaderByIndex.get(month)}`}
                    >
                      {MONTH_LABELS[month] || String(month)}
                    </th>
                  ))
                ) : (
                  <th
                    scope='col'
                    rowSpan={2}
                    className='sticky top-0 border-b border-slate-200/80 bg-white px-4 py-2 text-left font-semibold dark:bg-slate-950'
                  >
                    No months
                  </th>
                )}
              </tr>
              <tr>
                {pivotColumns.length > 0 ? (
                  pivotColumns.map((cell) => (
                    <th
                      key={`${cell.month}-${cell.metric}`}
                      scope='col'
                      className={`sticky top-0 z-10 border-b border-slate-200/80 px-2 py-2 text-center font-medium ${monthHeaderByIndex.get(cell.month)}`}
                    >
                      {cell.metric.toUpperCase()}
                    </th>
                  ))
                ) : (
                  <th
                    scope='col'
                    className='sticky top-0 border-b border-slate-200/80 bg-white px-4 py-2 font-medium dark:border-white/10 dark:bg-slate-950'
                  >
                    Value
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {dayRows.map((day) => (
                <tr
                  key={`day-${day}`}
                  className='border-b border-slate-200/70 align-top last:border-b-0 dark:border-white/10'
                >
                  <td className='sticky left-0 z-10 border-r border-slate-200/80 bg-white px-4 py-3 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-slate-950'>
                    {day}
                  </td>
                  {pivotColumns.length > 0 ? (
                    pivotColumns.map((cell) => {
                      const sourceRow = sourceRows.get(cell.month)?.get(day);

                      if (!sourceRow) {
                        const newRowKey = `__new-${selectedYear}-${cell.month}-${day}`;
                        const rowDraft = drafts[newRowKey] ?? {};

                        return (
                          <td
                            key={`day-${day}-${cell.month}-${cell.metric}`}
                            className='min-w-[114px] px-2 py-3'
                          >
                            <CellEditor
                              column={cell.metric}
                              id={`cell-${normalizeFieldId(newRowKey)}-${normalizeFieldId(cell.metric)}-${normalizeFieldId(String(cell.month))}-desktop`}
                              ariaLabel={cell.metric}
                              value={rowDraft[cell.metric] ?? ''}
                              onChange={(value) =>
                                onDraftChange(newRowKey, cell.metric, value)
                              }
                            />
                          </td>
                        );
                      }

                      return (
                        <td
                          key={`day-${day}-${cell.month}-${cell.metric}`}
                          className='min-w-[114px] px-2 py-3'
                        >
                          <CellEditor
                            column={cell.metric}
                            id={`cell-${normalizeFieldId(sourceRow.rowKey)}-${normalizeFieldId(cell.metric)}-${normalizeFieldId(String(cell.month))}-desktop`}
                            ariaLabel={cell.metric}
                            value={sourceRow.draft[cell.metric] ?? ''}
                            onChange={(value) =>
                              onDraftChange(sourceRow.rowKey, cell.metric, value)
                            }
                          />
                        </td>
                      );
                    })
                  ) : (
                    <td className='px-4 py-3 text-xs text-slate-400'>
                      —
                    </td>
                  )}
                  <td className='sticky right-0 bg-white/95 px-4 py-3 text-right dark:bg-slate-950/95'>
                    <SaveRowButton
                      isDirty={isDayDirty(day)}
                      isSaving={isDaySaving(day)}
                      onClick={() => handleSaveDay(day)}
                      label={
                        selectedMonth ? 'Save' : `Save day ${String(day).padStart(2, '0')}`
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className='overflow-x-auto'>
          <table className='w-full border-collapse text-left text-sm'>
            <thead className='bg-slate-100/80 text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:bg-white/5 dark:text-slate-400'>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column}
                    scope='col'
                    className='border-b border-slate-200/80 px-4 py-3 font-semibold dark:border-white/10'
                  >
                    {column}
                  </th>
                ))}
                <th
                  scope='col'
                  className='sticky right-0 border-b border-slate-200/80 bg-slate-100/95 px-4 py-3 text-right font-semibold dark:border-white/10 dark:bg-slate-950'
                >
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                const rowKey = getRowKey(row, rowIndex);
                const draft = drafts[rowKey] ?? {};
                const isDirty = isRowDirty(row, draft);

                return (
                  <tr
                    key={rowKey}
                    className='border-b border-slate-200/70 align-top last:border-b-0 dark:border-white/10'
                  >
                    {columns.map((column) => (
                      <td key={column} className='px-4 py-3'>
                        <CellEditor
                          column={column}
                          id={`cell-${normalizeFieldId(rowKey)}-${normalizeFieldId(column)}-desktop`}
                          ariaLabel={column}
                          value={draft[column] ?? ''}
                          onChange={(value) =>
                            onDraftChange(rowKey, column, value)
                          }
                        />
                      </td>
                    ))}
                    <td className='sticky right-0 bg-white/95 px-4 py-3 text-right dark:bg-slate-950/95'>
                      <SaveRowButton
                        isDirty={isDirty}
                        isSaving={savingRowKey === rowKey}
                        onClick={() => onSaveRow(row, rowIndex)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className='space-y-4 p-4 lg:hidden'>
        {rows.map((row, rowIndex) => {
          const rowKey = getRowKey(row, rowIndex);
          const draft = drafts[rowKey] ?? {};
          const isDirty = isRowDirty(row, draft);

          return (
            <div
              key={rowKey}
              className='rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-white/10 dark:bg-white/5'
            >
              <div className='mb-4 flex items-center justify-between gap-3'>
                <div>
                  <p className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400'>
                    Row {rowIndex + 1}
                  </p>
                  <p className='mt-1 truncate text-sm font-semibold text-slate-950 dark:text-white'>
                    Editable row
                  </p>
                </div>
                <SaveRowButton
                  isDirty={isDirty}
                  isSaving={savingRowKey === rowKey}
                  onClick={() => onSaveRow(row, rowIndex)}
                />
              </div>

              <div className='space-y-3'>
                {columns.map((column) => (
                  <div key={column} className='space-y-1.5'>
                    {isDateColumn(column) ? (
                      <p className='text-xs text-slate-500 dark:text-slate-400'>
                        {column}
                      </p>
                    ) : (
                      <>
                        <Label
                          htmlFor={`cell-${normalizeFieldId(rowKey)}-${normalizeFieldId(column)}-mobile`}
                          className='text-xs text-slate-500 dark:text-slate-400'
                        >
                          {column}
                        </Label>
                        <CellEditor
                          id={`cell-${normalizeFieldId(rowKey)}-${normalizeFieldId(column)}-mobile`}
                          ariaLabel={column}
                          column={column}
                          value={draft[column] ?? ''}
                          onChange={(value) =>
                            onDraftChange(rowKey, column, value)
                          }
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function SaveRowButton({
  isDirty,
  isSaving,
  onClick,
  label,
}: {
  isDirty: boolean;
  isSaving: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <Button
      type='button'
      size='sm'
      onClick={onClick}
      disabled={!isDirty || isSaving}
      className='rounded-xl'
    >
      {isSaving ? (
        <Loader2 className='size-3.5 animate-spin' />
      ) : (
        <Save className='size-3.5' />
      )}
      {label || 'Save'}
    </Button>
  );
}
