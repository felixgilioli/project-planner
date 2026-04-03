'use client'

import { useState, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { CalendarDayData } from '@/app/actions/calendar'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarMonthProps {
  year: number
  month: number // 0-indexed
  days: CalendarDayData[]
  today: string // 'YYYY-MM-DD'
  onDayChange: (date: string, type: 'working' | 'non_working', reason: string | null) => void
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// ─── CalendarMonth ────────────────────────────────────────────────────────────

export function CalendarMonth({ year, month, days, today, onDayChange }: CalendarMonthProps) {
  // Build lookup map for this month's days — memoized to avoid re-creating on every render
  const dayMap = useMemo(() => new Map(days.map((d) => [d.date, d])), [days])

  // Build grid cells — memoized since year/month never change while this component is mounted
  const { cells } = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const dow = firstDay.getDay() // 0=Sun

    const monthStr = String(month + 1).padStart(2, '0')
    const result: (string | null)[] = [
      ...Array(dow).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => {
        return `${year}-${monthStr}-${String(i + 1).padStart(2, '0')}`
      }),
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
          <div
            key={label}
            className="text-center text-[10px] font-medium text-muted-foreground py-1"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-px">
        {cells.map((dateStr, idx) => {
          if (!dateStr) {
            return <div key={`empty-${idx}`} />
          }

          const dayData = dayMap.get(dateStr)
          const isToday = dateStr === today

          return (
            <DayCell
              key={dateStr}
              dateStr={dateStr}
              dayData={dayData ?? { date: dateStr, type: 'working', reason: null }}
              isToday={isToday}
              onDayChange={onDayChange}
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
  onDayChange: (date: string, type: 'working' | 'non_working', reason: string | null) => void
}

function DayCell({ dateStr, dayData, isToday, onDayChange }: DayCellProps) {
  const [open, setOpen] = useState(false)
  const [localReason, setLocalReason] = useState(dayData.reason ?? '')
  const [localType, setLocalType] = useState<'working' | 'non_working'>(dayData.type)
  const [saving, setSaving] = useState(false)

  const isHoliday = dayData.type === 'non_working'
  const dayNum = parseInt(dateStr.slice(8))

  function handleOpen(isOpen: boolean) {
    if (isOpen) {
      // Reset local state to current values
      setLocalType(dayData.type)
      setLocalReason(dayData.reason ?? '')
    }
    setOpen(isOpen)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const reason = localType === 'non_working' ? (localReason.trim() || null) : null
      onDayChange(dateStr, localType, reason)
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          title={isHoliday && dayData.reason ? dayData.reason : undefined}
          className={cn(
            'flex items-center justify-center rounded text-[11px] h-7 w-full cursor-pointer transition-colors',
            'hover:bg-accent hover:text-accent-foreground',
            isHoliday
              ? 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400'
              : 'bg-background text-foreground',
            isToday && 'ring-1 ring-inset ring-primary font-bold',
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

        {/* Toggle */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setLocalType('working')}
            className={cn(
              'flex-1 rounded px-2 py-1 text-xs font-medium border transition-colors',
              localType === 'working'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-foreground border-border hover:bg-accent',
            )}
          >
            Útil
          </button>
          <button
            type="button"
            onClick={() => setLocalType('non_working')}
            className={cn(
              'flex-1 rounded px-2 py-1 text-xs font-medium border transition-colors',
              localType === 'non_working'
                ? 'bg-destructive text-destructive-foreground border-destructive'
                : 'bg-background text-foreground border-border hover:bg-accent',
            )}
          >
            Não útil
          </button>
        </div>

        {/* Reason input */}
        {localType === 'non_working' && (
          <div className="space-y-1">
            <Label className="text-xs">Motivo</Label>
            <Input
              value={localReason}
              onChange={(e) => setLocalReason(e.target.value)}
              placeholder="Ex: Natal, Recesso..."
              className="h-8 text-xs"
            />
          </div>
        )}

        <Button
          size="sm"
          className="w-full h-8 text-xs"
          onClick={handleSave}
          disabled={saving}
        >
          {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          Salvar
        </Button>
      </PopoverContent>
    </Popover>
  )
}
