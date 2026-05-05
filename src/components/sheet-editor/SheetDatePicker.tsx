'use client';

import { CalendarDays } from 'lucide-react';
import { useState } from 'react';

import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  formatDateValue,
  parseDateValue,
} from '@/components/sheet-editor/sheet-editor-date';
import { cn } from '@/lib/utils';

interface SheetDatePickerProps {
  id?: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  className?: string;
}

export default function SheetDatePicker({
  id,
  value,
  placeholder,
  onChange,
  className,
}: SheetDatePickerProps) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseDateValue(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type='button'
          variant='outline'
          className={cn(
            'h-11 w-full justify-start rounded-xl border-input bg-white/80 px-3 text-left font-normal dark:bg-white/5',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarDays className='size-4 text-slate-400' />
          {value || placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='w-[var(--radix-popover-trigger-width)] p-4 font-sans'
      >
        <Calendar
          className='w-full font-sans'
          selected={selectedDate}
          onSelect={(date) => {
            onChange(formatDateValue(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
