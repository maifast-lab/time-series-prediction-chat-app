'use client';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  getTodayDateValue,
  isDateColumn,
} from '@/components/sheet-editor/sheet-editor-date';
import { cn } from '@/lib/utils';
import { type ClipboardEvent } from 'react';

interface CellEditorProps {
  column: string;
  id?: string;
  ariaLabel?: string;
  value: string;
  onChange: (value: string) => void;
  onPasteValues?: (values: string[]) => void;
  onPasteError?: (message: string) => void;
  maxPasteValues?: number;
}

const DEFAULT_MAX_PASTE_VALUES = 4;

function isNumericValue(value: string) {
  return /^\d+$/.test(value);
}

function parsePastedValues(value: string): string[] {
  const normalized = value
    .replace(/\r\n/g, '\n')
    .replace(/[\t,]/g, ' ')
    .trim();

  if (!normalized) {
    return [];
  }

  return normalized.split(/\s+/).filter(Boolean);
}

function isLongCellValue(value: string) {
  return value.length > 90 || value.includes('\n') || /^[{[]/.test(value);
}
export default function CellEditor({
  column,
  id,
  ariaLabel,
  value,
  onChange,
  onPasteValues,
  onPasteError,
  maxPasteValues = DEFAULT_MAX_PASTE_VALUES,
}: CellEditorProps) {
  if (isDateColumn(column)) {
    return <ReadOnlyCellValue value={value || getTodayDateValue()} />;
  }

  const className = cn(
    'w-full h-8 max-w-[36px] min-w-0 rounded-xl bg-white/80 text-sm dark:bg-white/5 border-0 !px-1 !py-1',
  );

  const handlePaste = (
    event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const pasted = event.clipboardData?.getData('text');
    if (!pasted) {
      return;
    }

    const values = parsePastedValues(pasted);
    if (values.length <= 1 || !onPasteValues) {
      return;
    }

    const invalidValue = values.find((item) => !isNumericValue(item));
    if (invalidValue) {
      event.preventDefault();
      onPasteError?.(`Only numbers are allowed. Found "${invalidValue}".`);
      return;
    }

    const sanitized = values.slice(0, maxPasteValues);
    if (values.length > maxPasteValues) {
      event.preventDefault();
      onPasteError?.(`Only ${maxPasteValues} values are allowed.`);
      onPasteValues(sanitized);
      return;
    }

    event.preventDefault();
    onPasteValues(values);
  };

  if (isLongCellValue(value)) {
    return (
      <Textarea
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onPaste={handlePaste}
        className={cn(className, 'resize-none')}
      />
    );
  }

  return (
    <Input
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onPaste={handlePaste}
      className={className}
    />
  );
}

function ReadOnlyCellValue({ value }: { value: string }) {
  return (
    <div className='flex h-8 w-full min-w-0 items-center rounded-xl bg-slate-100/80 px-1 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300'>
      {value}
    </div>
  );
}
