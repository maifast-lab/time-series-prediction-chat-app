'use client';

import { RotateCcw, Search } from 'lucide-react';

import SheetDatePicker from '@/components/sheet-editor/SheetDatePicker';
import {
  MONTH_OPTIONS,
  ROW_LIMIT_OPTIONS,
} from '@/components/sheet-editor/sheet-editor-config';
import type { FilterState } from '@/components/sheet-editor/sheet-editor-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  onFilterChange: <K extends keyof FilterState>(
    key: K,
    value: FilterState[K],
  ) => void;
  onReset: () => void;
}

export default function SheetFilters({
  filters,
  isLoading,
  filterError,
  onFilterChange,
  onReset,
}: SheetFiltersProps) {
  return (
    <div className='px-5 py-5 sm:px-6'>
      <div className='grid gap-4 lg:grid-cols-[1.15fr_0.55fr_0.7fr_0.8fr_0.8fr_0.65fr_auto] lg:items-end'>
        <div className='space-y-2'>
          <Label htmlFor='sheet-search'>Search value</Label>
          <div className='relative'>
            <Search className='pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400' />
            <Input
              id='sheet-search'
              value={filters.search}
              onChange={(event) =>
                onFilterChange('search', event.target.value)
              }
              placeholder='FB_VALUE'
              className='h-11 rounded-xl bg-white/80 pl-9 dark:bg-white/5'
            />
          </div>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='sheet-year'>Year</Label>
          <Input
            id='sheet-year'
            type='number'
            inputMode='numeric'
            value={filters.year}
            onChange={(event) => onFilterChange('year', event.target.value)}
            placeholder='2026'
            className='h-11 rounded-xl bg-white/80 dark:bg-white/5'
          />
        </div>

        <div className='space-y-2'>
          <Label htmlFor='sheet-month'>Month</Label>
          <Select
            value={filters.month || 'all'}
            onValueChange={(value) =>
              onFilterChange('month', value === 'all' ? '' : value)
            }
          >
            <SelectTrigger id='sheet-month'>
              <SelectValue placeholder='All months' />
            </SelectTrigger>
            <SelectContent>
              {MONTH_OPTIONS.map((month) => (
                <SelectItem
                  key={month.value || 'all'}
                  value={month.value || 'all'}
                >
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='sheet-start-date'>Start date</Label>
          <SheetDatePicker
            id='sheet-start-date'
            value={filters.startDate}
            placeholder='Start date'
            onChange={(value) => onFilterChange('startDate', value)}
          />
        </div>

        <div className='space-y-2'>
          <Label htmlFor='sheet-end-date'>End date</Label>
          <SheetDatePicker
            id='sheet-end-date'
            value={filters.endDate}
            placeholder='End date'
            onChange={(value) => onFilterChange('endDate', value)}
          />
        </div>

        <div className='space-y-2'>
          <Label htmlFor='sheet-row-limit'>Rows</Label>
          <Select
            value={String(filters.limit)}
            onValueChange={(value) => onFilterChange('limit', Number(value))}
          >
            <SelectTrigger id='sheet-row-limit'>
              <SelectValue placeholder='Rows' />
            </SelectTrigger>
            <SelectContent>
              {ROW_LIMIT_OPTIONS.map((limit) => (
                <SelectItem key={limit} value={String(limit)}>
                  {limit}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='flex gap-2'>
          <Button
            type='button'
            variant='outline'
            size='lg'
            onClick={onReset}
            disabled={isLoading}
            className='h-11 rounded-xl'
            aria-label='Reset filters'
          >
            <RotateCcw className='size-4' />
          </Button>
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
