'use client'

import { useState, useMemo } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { CalendarDayData } from '@/lib/calendar-utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarMonthProps {
  year: number
  month: number // 0-indexed
  days: CalendarDayData[]
  today: string // 'YYYY-MM-DD'
  onEventRemove: (eventId: string) => void
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const EVENT_TYPE_LABELS: Record<string, string> = {
  holiday: 'Feriado',
  freeze: 'Freeze',
  extra_working: 'Dia extra útil',
  vacation: 'Férias',
  day_off: 'Day off',
}

// ─── CalendarMonth ────────────────────────────────────────────────────────────

export function CalendarMonth({ year, month, days, today, onEventRemove }: CalendarMonthProps) {
  const dayMap = useMemo(() => new Map(days.map((d) => [d.date, d])), [days])

  const { cells } = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const dow = firstDay.getDay()

    const monthStr = String(month + 1).padStart(2, '0')
    const result: (string | null)[] = [
      ...Array(dow).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) =>
        `${year}-${monthStr}-${String(i + 1).padStart(2, '0')}`,
      ),
    ]
    while (result.length % 7 !== 0) result.push(null)
    return { cells: result }
  }, [year, month])

  return (
    <div className="rounded-lg border bg-card p-3">
      <h3 className="mb-2 text-center text-sm font-semibold text-foreground">
        {MONTH_NAMES[month]}
      </h3>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map((label) => (
          <div key={label} className="text-center text-[10px] font-medium text-muted-foreground py-1">
            {label}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-px">
        {cells.map((dateStr, idx) => {
          if (!dateStr) return <div key={`empty-${idx}`} />

          const dayData = dayMap.get(dateStr)
          const isToday = dateStr === today

          return (
            <DayCell
              key={dateStr}
              dateStr={dateStr}
              dayData={dayData ?? { date: dateStr, type: 'working', reason: null, events: [] }}
              isToday={isToday}
              onEventRemove={onEventRemove}
            />
          )
        })}
      </div>
    </div>
  )
}

// ─── DayCell ──────────────────────────────────────────────────────────────────

interface DayCellProps {
  dateStr: string
  dayData: CalendarDayData
  isToday: boolean
  onEventRemove: (eventId: string) => void
}

function DayCell({ dateStr, dayData, isToday, onEventRemove }: DayCellProps) {
  const [open, setOpen] = useState(false)

  const isNonWorking = dayData.type === 'non_working'
  const isFreeze = dayData.eventType === 'freeze'
  const dayNum = parseInt(dateStr.slice(8))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          title={dayData.reason ?? undefined}
          className={cn(
            'flex items-center justify-center rounded text-[11px] h-7 w-full cursor-pointer transition-colors',
            'hover:bg-accent hover:text-accent-foreground',
            // non-working (holiday, vacation, day_off)
            isNonWorking && !isFreeze && 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400',
            // freeze — working day, purple ring
            isFreeze && 'ring-1 ring-inset ring-purple-400 text-foreground',
            // normal working day
            !isNonWorking && !isFreeze && 'bg-background text-foreground',
            isToday && 'ring-1 ring-inset ring-primary font-bold',
            // today + freeze: primary ring takes precedence
            isToday && isFreeze && 'ring-primary',
          )}
        >
          {dayNum}
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-3 space-y-3" side="bottom" align="center">
        <p className="text-xs font-medium text-muted-foreground">
          {new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>

        {dayData.events.length > 0 ? (
          <div className="space-y-2">
            {dayData.events.map((event) => (
              <div key={event.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium">
                    {EVENT_TYPE_LABELS[event.type] ?? event.type}
                  </p>
                  {event.label && (
                    <p className="text-xs text-muted-foreground truncate">{event.label}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => { onEventRemove(event.id); setOpen(false) }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Nenhum evento neste dia.</p>
        )}
      </PopoverContent>
    </Popover>
  )
}
