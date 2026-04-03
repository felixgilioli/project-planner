'use client'

import { useState, useTransition, useMemo, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Loader2, CalendarDays } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/shared/page-header'
import { CalendarMonth } from '@/components/calendar/calendar-month'
import { getCalendar, saveCalendar } from '@/app/actions/calendar'
import type { CalendarDayData } from '@/app/actions/calendar'

// ─── Props ────────────────────────────────────────────────────────────────────

interface CalendarClientProps {
  projectId: string
  initialYear: number
  initialData: { calendarId: string | null; days: CalendarDayData[]; workingDaysCount: number }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CalendarClient({ projectId, initialYear, initialData }: CalendarClientProps) {
  const [year, setYear] = useState(initialYear)
  const [days, setDays] = useState<CalendarDayData[]>(initialData.days)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, startSaving] = useTransition()
  const [isLoadingYear, startLoadingYear] = useTransition()

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])

  // Derived stats — memoized to avoid re-filtering 365 items on every render
  const holidays = useMemo(
    () => days.filter((d) => d.type === 'non_working').length,
    [days],
  )
  const workingDays = useMemo(() => days.filter((d) => d.type === 'working').length, [days])

  // Pre-split days by month so each CalendarMonth doesn't re-filter the full 365-item array
  const daysByMonth = useMemo(() => {
    const buckets: CalendarDayData[][] = Array.from({ length: 12 }, () => [])
    for (const d of days) {
      const month = parseInt(d.date.slice(5, 7)) - 1
      buckets[month].push(d)
    }
    return buckets
  }, [days])

  const handleYearChange = useCallback(function handleYearChange(delta: number) {
    const newYear = year + delta
    startLoadingYear(async () => {
      try {
        const result = await getCalendar(projectId, newYear)
        setYear(newYear)
        setDays(result.days)
        setIsDirty(false)
      } catch {
        toast.error('Erro ao carregar calendário.')
      }
    })
  }, [year, projectId])

  function handleDayChange(date: string, type: 'working' | 'non_working', reason: string | null) {
    setDays((prev) =>
      prev.map((d) => (d.date === date ? { ...d, type, reason } : d)),
    )
    setIsDirty(true)
  }

  function handleSave() {
    startSaving(async () => {
      try {
        const nonWorkingDays = days
          .filter((d) => d.type === 'non_working')
          .map((d) => ({ date: d.date, reason: d.reason }))

        await saveCalendar(projectId, year, nonWorkingDays)
        setIsDirty(false)
        toast.success('Calendário salvo com sucesso.')
      } catch {
        toast.error('Erro ao salvar calendário.')
      }
    })
  }

  const isLoading = isLoadingYear

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-6 space-y-6">
        {/* Header */}
        <PageHeader title="Calendário">
          <div className="flex items-center gap-2">
            {isDirty && (
              <Badge variant="warning" className="gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                Alterações pendentes
              </Badge>
            )}
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving || !isDirty || isLoading}
              className="gap-1.5"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarDays className="h-4 w-4" />
              )}
              Salvar calendário
            </Button>
          </div>
        </PageHeader>

        {/* Year selector */}
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => handleYearChange(-1)}
            disabled={isLoading}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xl font-bold w-16 text-center">
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : year}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => handleYearChange(1)}
            disabled={isLoading}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{workingDays}</p>
            <p className="text-xs text-muted-foreground mt-1">Dias úteis</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-destructive">{holidays}</p>
            <p className="text-xs text-muted-foreground mt-1">Dias não úteis</p>
          </Card>
        </div>

        {/* 12-month grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 12 }, (_, month) => (
            <CalendarMonth
              key={`${year}-${month}`}
              year={year}
              month={month}
              days={daysByMonth[month]}
              today={todayStr}
              onDayChange={handleDayChange}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
