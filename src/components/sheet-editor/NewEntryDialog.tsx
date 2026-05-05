'use client';

import { Loader2, Plus, Save } from 'lucide-react';

import CellEditor from '@/components/sheet-editor/CellEditor';
import SheetDatePicker from '@/components/sheet-editor/SheetDatePicker';
import { isDateColumn } from '@/components/sheet-editor/sheet-editor-date';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface NewEntryDialogProps {
  open: boolean;
  columns: string[];
  draft: Record<string, string>;
  canSave: boolean;
  isSaving: boolean;
  isDisabled: boolean;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (column: string, value: string) => void;
  onSave: () => void;
}

export default function NewEntryDialog({
  open,
  columns,
  draft,
  canSave,
  isSaving,
  isDisabled,
  onOpenChange,
  onDraftChange,
  onSave,
}: NewEntryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type='button' disabled={isDisabled} className='rounded-xl'>
          <Plus className='size-4' />
          Add entry
        </Button>
      </DialogTrigger>

      <DialogContent className='font-sans'>
        <DialogHeader>
          <DialogTitle>New entry</DialogTitle>
          <DialogDescription>Add row values and save the entry.</DialogDescription>
        </DialogHeader>

        <div className='max-h-[min(540px,calc(100vh-13rem))] overflow-y-auto px-6 pb-2'>
          <div className='grid gap-4 md:grid-cols-2'>
            {columns.map((column) => {
              const isDate = isDateColumn(column);

              return (
                <div
                  key={column}
                  className={cn('space-y-2', isDate && 'md:col-span-2')}
                >
                  <Label className='text-xs text-slate-500 dark:text-slate-400'>
                    {column}
                  </Label>
                  {isDate ? (
                    <SheetDatePicker
                      value={draft[column] ?? ''}
                      placeholder='Select date'
                      onChange={(value) => onDraftChange(column, value)}
                    />
                  ) : (
                    <CellEditor
                      column={column}
                      value={draft[column] ?? ''}
                      onChange={(value) => onDraftChange(column, value)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
            className='rounded-xl'
          >
            Cancel
          </Button>
          <Button
            type='button'
            onClick={onSave}
            disabled={!canSave || isSaving}
            className='rounded-xl'
          >
            {isSaving ? (
              <Loader2 className='size-3.5 animate-spin' />
            ) : (
              <Save className='size-3.5' />
            )}
            Save entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
