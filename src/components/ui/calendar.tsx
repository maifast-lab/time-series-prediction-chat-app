"use client"

import * as React from "react"
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface CalendarProps {
  selected?: Date
  onSelect?: (date: Date) => void
  month?: Date
  onMonthChange?: (date: Date) => void
  className?: string
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

function Calendar({
  selected,
  onSelect,
  month,
  onMonthChange,
  className,
}: CalendarProps) {
  const [internalMonth, setInternalMonth] = React.useState(
    month ?? selected ?? new Date()
  )
  const visibleMonth = month ?? internalMonth
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(visibleMonth)),
    end: endOfWeek(endOfMonth(visibleMonth)),
  })

  function setVisibleMonth(nextMonth: Date) {
    setInternalMonth(nextMonth)
    onMonthChange?.(nextMonth)
  }

  return (
    <div data-slot="calendar" className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => setVisibleMonth(subMonths(visibleMonth, 1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="text-sm font-semibold text-foreground">
          {format(visibleMonth, "MMMM yyyy")}
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="py-1">
            {weekday}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const isSelected = selected ? isSameDay(day, selected) : false
          const isCurrentMonth = isSameMonth(day, visibleMonth)

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelect?.(day)}
              className={cn(
                "flex h-9 items-center justify-center rounded-lg text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring",
                !isCurrentMonth && "text-muted-foreground/45",
                isSelected &&
                  "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
              )}
            >
              {format(day, "d")}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export { Calendar }
