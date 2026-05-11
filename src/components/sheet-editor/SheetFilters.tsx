'use client';

import type { FilterState } from '@/components/sheet-editor/sheet-editor-types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SheetFiltersProps {
  filters: FilterState;
  isLoading: boolean;
  filterError: string;
  availableYears: number[];
  onFilterChange: <K extends keyof FilterState>(
    key: K,
    value: FilterState[K],
  ) => void;
  onReset: () => void;
}

export default function SheetFilters({
  filters,
  filterError,
  availableYears,
  onFilterChange,
}: SheetFiltersProps) {
  const yearOptions = availableYears.map(String);
  const hasYears = yearOptions.length > 0;
  const yearValue = filters.year.trim() || (hasYears ? yearOptions[0] : '');
  return (
    <div className='px-5 py-5 sm:px-6'>
      <div className='grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end'>
        <div className='space-y-2'>
          {hasYears ? (
            <Select
              value={yearValue}
              onValueChange={(value) => onFilterChange('year', value)}
            >
              <SelectTrigger id='sheet-year'>
                <SelectValue placeholder='Select year' />
              </SelectTrigger>
              <SelectContent> 
                {yearOptions.map((year) => (
                  <SelectItem key={year} value={year}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : ( 
            <div className='flex h-11 items-center rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm text-slate-500 dark:border-white/20 dark:bg-white/5'>
              Loading years...
            </div>
          )}
        </div>
      </div>

      {filterError ? (
        <p className='mt-3 text-sm text-red-600 dark:text-red-400'>
          {filterError}
        </p>
      ) : null}
    </div>
  );
}
