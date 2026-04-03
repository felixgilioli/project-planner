'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import type { CalendarEventData } from '@/lib/calendar-utils'

interface EventDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onEventCreate: (event: Omit<CalendarEventData, 'id'>) => void
}

type EventFormType = 'holiday' | 'freeze'

const TYPE_OPTIONS: { value: EventFormType; label: string; description: string }[] = [
  { value: 'holiday', label: 'Feriado', description: 'Dia não útil para todo o projeto' },
  { value: 'freeze', label: 'Freeze', description: 'Sem deploys — dia permanece útil' },
]

export function EventDialog({ open, onOpenChange, onEventCreate }: EventDialogProps) {
  const [type, setType] = useState<EventFormType>('holiday')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      setType('holiday')
      setStartDate('')
      setEndDate('')
      setLabel('')
      setError(null)
    }
    onOpenChange(isOpen)
  }

  function handleSubmit() {
    if (!startDate) { setError('Informe a data de início.'); return }
    if (!label.trim()) { setError('Informe um nome para o evento.'); return }

    const resolvedEnd = endDate && endDate >= startDate ? endDate : startDate
    if (endDate && endDate < startDate) {
      setError('A data final não pode ser anterior à data de início.')
      return
    }

    setError(null)
    onEventCreate({ type, startDate, endDate: resolvedEnd, memberId: null, label: label.trim() })
    handleOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Criar evento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Type selector */}
          <div className="space-y-2">
            <Label>Tipo</Label>
            <div className="grid grid-cols-2 gap-2">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={cn(
                    'flex flex-col items-start rounded-lg border p-3 text-left transition-colors',
                    type === opt.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-accent',
                  )}
                >
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="text-xs text-muted-foreground mt-0.5">{opt.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="start-date">De</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  if (!endDate) setEndDate(e.target.value)
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end-date">Até</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Label */}
          <div className="space-y-1.5">
            <Label htmlFor="event-label">Nome</Label>
            <Input
              id="event-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={type === 'holiday' ? 'Ex: Tiradentes, Natal...' : 'Ex: Freeze Q4, Release v2...'}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit}>Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
