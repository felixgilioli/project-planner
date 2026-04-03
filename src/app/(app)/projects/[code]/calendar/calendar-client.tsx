'use client'

import { useState, useTransition, useMemo, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Loader2, CalendarDays, Settings2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { PageHeader } from '@/components/shared/page-header'
import { CalendarMonth } from '@/components/calendar/calendar-month'
import { EventDialog } from '@/components/calendar/event-dialog'
import { getCalendar, saveCalendar } from '@/app/actions/calendar'
import { computeDaysFromEvents } from '@/lib/calendar-utils'
import type { CalendarEventData } from '@/app/actions/calendar'

// ─── Props ────────────────────────────────────────────────────────────────────

interface CalendarClientProps {
  projectId: string
  initialYear: number
  initialData: {
    calendarId: string | null
    events: CalendarEventData[]
    workingDaysCount: number
    workingDays: number[]
  }
  members: { id: string; name: string }[]
}

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// ─── Component ────────────────────────────────────────────────────────────────

export function CalendarClient({ projectId, initialYear, initialData, members }: CalendarClientProps) {
  const [year, setYear] = useState(initialYear)
  const [events, setEvents] = useState<CalendarEventData[]>(initialData.events)
  const [weekConfig, setWeekConfig] = useState<number[]>(initialData.workingDays)
  const [isDirty, setIsDirty] = useState(false)
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false)
  const [isSaving, startSaving] = useTransition()
  const [isLoadingYear, startLoadingYear] = useTransition()

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])

  // Derived days — computed from events + weekConfig
  const days = useMemo(
    () => computeDaysFromEvents(year, weekConfig, events),
    [year, weekConfig, events],
  )

  // Derived stats
  const nonWorkingCount = useMemo(() => days.filter((d) => d.type === 'non_working').length, [days])
  const workingCount = useMemo(() => days.filter((d) => d.type === 'working').length, [days])

  // Pre-split days by month so each CalendarMonth doesn't re-filter the full 365-item array
  const daysByMonth = useMemo(() => {
    const buckets = Array.from({ length: 12 }, () => [] as typeof days)
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
        setEvents(result.events)
        setWeekConfig(result.workingDays)
        setIsDirty(false)
      } catch {
        toast.error('Erro ao carregar calendário.')
      }
    })
  }, [year, projectId])

  function handleWeekConfigChange(dow: number) {
    const next = weekConfig.includes(dow)
      ? weekConfig.filter((d) => d !== dow)
      : [...weekConfig, dow]

    if (next.length === 0) return // garante ao menos 1 dia útil

    setWeekConfig(next)
    setIsDirty(true)
  }

  function handleEventCreate(event: Omit<CalendarEventData, 'id'>) {
    setEvents((prev) => [...prev, { ...event, id: crypto.randomUUID() }])
    setIsDirty(true)
  }

  function handleEventRemove(eventId: string) {
    setEvents((prev) => prev.filter((e) => e.id !== eventId))
    setIsDirty(true)
  }

  function handleSave() {
    startSaving(async () => {
      try {
        await saveCalendar(projectId, year, events, weekConfig)
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
            <Button variant="outline" size="sm" onClick={() => setIsEventDialogOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Criar evento
            </Button>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Settings2 className="h-4 w-4" />
                  Configurações
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetHeader>
                  <SheetTitle>Configurações do calendário</SheetTitle>
                </SheetHeader>
                <div className="mt-6 space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Dias úteis da semana</p>
                    <p className="text-xs text-muted-foreground">
                      Selecione quais dias da semana são considerados úteis neste projeto.
                    </p>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {DAY_LABELS.map((label, dow) => (
                        <button
                          key={dow}
                          type="button"
                          onClick={() => handleWeekConfigChange(dow)}
                          className={cn(
                            'h-8 w-12 rounded text-xs font-medium border transition-colors',
                            weekConfig.includes(dow)
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background text-muted-foreground border-border hover:bg-accent',
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
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
            <p className="text-2xl font-bold text-primary">{workingCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Dias úteis</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-destructive">{nonWorkingCount}</p>
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
              onEventRemove={handleEventRemove}
            />
          ))}
        </div>
      </div>

      <EventDialog
        open={isEventDialogOpen}
        onOpenChange={setIsEventDialogOpen}
        onEventCreate={handleEventCreate}
        members={members}
      />
    </div>
  )
}
