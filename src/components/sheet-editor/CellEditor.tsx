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
  id?: string;
  ariaLabel?: string;
  value: string;
  onChange: (value: string) => void;
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
}: CellEditorProps) {
  if (isDateColumn(column)) {
    return <ReadOnlyCellValue value={value || getTodayDateValue()} />;
  }

  const className = cn(
    'w-full h-8 max-w-[36px] min-w-0 rounded-xl bg-white/80 text-sm dark:bg-white/5 border-0 !px-1 !py-1',
  );

  if (isLongCellValue(value)) {
    return (
      <Textarea
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
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
