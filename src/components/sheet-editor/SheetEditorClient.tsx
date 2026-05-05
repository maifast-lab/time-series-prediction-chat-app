'use client';

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
} from 'lucide-react';

import { AppPanel } from '@/components/app/AppPage';
import NewEntryDialog from '@/components/sheet-editor/NewEntryDialog';
import SheetFilters from '@/components/sheet-editor/SheetFilters';
import SheetRowsTable from '@/components/sheet-editor/SheetRowsTable';
import { useSheetEditor } from '@/components/sheet-editor/useSheetEditor';
import { Button } from '@/components/ui/button';

export default function SheetEditorClient() {
  const editor = useSheetEditor();

  console.log(editor.metadata.total);
  if(editor.metadata.total === 0){
    return (
      <div className='px-5 py-12 text-center sm:px-6'>
        <div className='mx-auto flex size-14 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-200'>
          <CalendarDays className='size-6' />
        </div>
        <h3 className='mt-4 text-lg font-semibold text-slate-950 dark:text-white'>
          Please add your file first
        </h3>
        <p className='mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400'>
          Upload a CSV or Excel file from the sidebar, then return here to
          search, filter, edit, and save rows.
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-5'>
      <AppPanel className='rounded-[28px]'>
        <SheetFilters
          filters={editor.filters}
          isLoading={editor.isLoading}
          filterError={editor.filterError}
          onFilterChange={editor.updateFilter}
          onReset={editor.resetFilters}
        />
      </AppPanel>

      <AppPanel className='overflow-hidden rounded-[28px]'>
        <div className='flex flex-col gap-4 border-b border-slate-200/80 px-5 py-5 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between sm:px-6'>
          <div className='flex items-center gap-3'>
            <div className='flex size-11 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-200'>
              <FileSpreadsheet className='size-5' />
            </div>
            <div>
              <h2 className='text-lg font-semibold text-slate-950 dark:text-white'>
                Sheet rows
              </h2>
              <p className='text-sm text-slate-500 dark:text-slate-400'>
                {editor.metadata.total !== null
                  ? `${editor.metadata.total} total rows`
                  : `${editor.rows.length} rows loaded`}
              </p>
            </div>
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            <NewEntryDialog
              open={editor.isAddingRow}
              columns={editor.entryColumns}
              draft={editor.newRowDraft}
              canSave={editor.canSaveNewRow}
              isSaving={editor.isCreatingRow}
              isDisabled={editor.isLoading}
              onOpenChange={editor.setEntryDialogOpen}
              onDraftChange={editor.updateNewRowCell}
              onSave={editor.saveNewRow}
            />

            <Button
              type='button'
              variant='outline'
              onClick={editor.refreshRows}
              disabled={editor.isLoading}
              className='rounded-xl'
            >
              {editor.isLoading ? (
                <Loader2 className='size-4 animate-spin' />
              ) : (
                <RefreshCw className='size-4' />
              )}
              Refresh
            </Button>

            {editor.canPage ? (
              <div className='flex items-center gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  size='icon'
                  onClick={() => editor.setPage(editor.appliedFilters.page - 1)}
                  disabled={
                    editor.isLoading || editor.appliedFilters.page <= 1
                  }
                  aria-label='Previous page'
                  className='rounded-xl'
                >
                  <ChevronLeft className='size-4' />
                </Button>
                <span className='min-w-14 text-center text-sm font-medium text-slate-600 dark:text-slate-300'>
                  {editor.metadata.page ?? editor.appliedFilters.page}
                </span>
                <Button
                  type='button'
                  variant='outline'
                  size='icon'
                  onClick={() => editor.setPage(editor.appliedFilters.page + 1)}
                  disabled={editor.isLoading || !editor.canGoNext}
                  aria-label='Next page'
                  className='rounded-xl'
                >
                  <ChevronRight className='size-4' />
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        {editor.errorMessage ? (
          <div className='px-5 py-8 text-sm text-red-600 dark:text-red-400 sm:px-6'>
            {editor.errorMessage}
          </div>
        ) : null}

        {!editor.errorMessage && editor.isLoading ? (
          <div className='flex items-center gap-3 px-5 py-10 text-sm text-slate-500 dark:text-slate-400 sm:px-6'>
            <Loader2 className='size-4 animate-spin' />
            Loading sheet data...
          </div>
        ) : null}

        {!editor.errorMessage && !editor.isLoading && editor.rows.length === 0 ? (
          <div className='px-5 py-12 text-center sm:px-6'>
            <div className='mx-auto flex size-14 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-200'>
              <CalendarDays className='size-6' />
            </div>
            <h3 className='mt-4 text-lg font-semibold text-slate-950 dark:text-white'>
              Please add your file first
            </h3>
            <p className='mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400'>
              Upload a CSV or Excel file from the sidebar, then return here to
              search, filter, edit, and save rows.
            </p>
          </div>
        ) : null}

        {!editor.errorMessage && !editor.isLoading && editor.rows.length > 0 ? (
          <SheetRowsTable
            columns={editor.columns}
            rows={editor.rows}
            drafts={editor.draftRows}
            savingRowKey={editor.savingRowKey}
            onDraftChange={editor.updateDraftCell}
            onSaveRow={editor.saveRow}
          />
        ) : null}
      </AppPanel>
    </div>
  );
}
