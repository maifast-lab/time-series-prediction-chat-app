'use client';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  getTodayDateValue,
  isDateColumn,
} from '@/components/sheet-editor/sheet-editor-date';
import { cn } from '@/lib/utils';

interface CellEditorProps {
  column: string;
  value: string;
  onChange: (value: string) => void;
}

function isLongCellValue(value: string) {
  return value.length > 90 || value.includes('\n') || /^[{[]/.test(value);
}

export default function CellEditor({
  column,
  value,
  onChange,
}: CellEditorProps) {
  if (isDateColumn(column)) {
    return <ReadOnlyCellValue value={value || getTodayDateValue()} />;
  }

  const className = cn(
    'min-w-44 rounded-xl bg-white/80 text-sm dark:bg-white/5',
    isLongCellValue(value) ? 'min-h-20' : 'h-10',
  );

  if (isLongCellValue(value)) {
    return (
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={className}
      />
    );
  }

  return (
    <Input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={className}
    />
  );
}

function ReadOnlyCellValue({ value }: { value: string }) {
  return (
    <div className='flex min-h-10 min-w-44 items-center rounded-xl border border-slate-200 bg-slate-100/80 px-3 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300'>
      {value}
    </div>
  );
}
