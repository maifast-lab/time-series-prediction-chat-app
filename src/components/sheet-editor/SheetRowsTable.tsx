'use client';

import { Loader2, Save } from 'lucide-react';

import CellEditor from '@/components/sheet-editor/CellEditor';
import {
  getRowKey,
  isRowDirty,
  type DataSourceRecord,
  type RowDraft,
} from '@/components/sheet-editor/sheet-editor-utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface SheetRowsTableProps {
  columns: string[];
  rows: DataSourceRecord[];
  drafts: Record<string, RowDraft>;
  savingRowKey: string | null;
  onDraftChange: (rowKey: string, column: string, value: string) => void;
  onSaveRow: (row: DataSourceRecord, rowIndex: number) => void;
}

export default function SheetRowsTable({
  columns,
  rows,
  drafts,
  savingRowKey,
  onDraftChange,
  onSaveRow,
}: SheetRowsTableProps) {
  return (
    <>
      <div className='hidden overflow-x-auto lg:block'>
        <table className='w-full min-w-[960px] border-collapse text-left text-sm'>
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
                    <Label className='text-xs text-slate-500 dark:text-slate-400'>
                      {column}
                    </Label>
                    <CellEditor
                      column={column}
                      value={draft[column] ?? ''}
                      onChange={(value) =>
                        onDraftChange(rowKey, column, value)
                      }
                    />
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
}: {
  isDirty: boolean;
  isSaving: boolean;
  onClick: () => void;
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
      Save
    </Button>
  );
}
