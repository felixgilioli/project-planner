// Pure calendar helpers — no 'use server', safe to import in client components

export type CalendarDayData = {
  date: string // 'YYYY-MM-DD'
  type: 'working' | 'non_working'
  reason: string | null
}

export type CalendarEventType = 'holiday' | 'vacation' | 'day_off' | 'freeze' | 'extra_working'

export type CalendarEventData = {
  id: string
  type: CalendarEventType
  startDate: string // 'YYYY-MM-DD'
  endDate: string   // 'YYYY-MM-DD'
  memberId: string | null
  label: string
}

const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5]

export function generateYearDays(
  year: number,
  workingDays: number[] = DEFAULT_WORKING_DAYS,
): CalendarDayData[] {
  const days: CalendarDayData[] = []
  const workingSet = new Set(workingDays)
  const end = new Date(year, 11, 31)

  for (let d = new Date(year, 0, 1); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10)
    days.push({
      date: dateStr,
      type: workingSet.has(d.getDay()) ? 'working' : 'non_working',
      reason: null,
    })
  }

  return days
}

export function computeDaysFromEvents(
  year: number,
  workingDays: number[],
  events: CalendarEventData[],
): CalendarDayData[] {
  const days = generateYearDays(year, workingDays)
  const dayMap = new Map(days.map((d) => [d.date, d]))

  for (const event of events) {
    const end = new Date(event.endDate + 'T12:00:00')
    for (let d = new Date(event.startDate + 'T12:00:00'); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10)
      const day = dayMap.get(dateStr)
      if (!day) continue
      if (event.type === 'extra_working') {
        day.type = 'working'
        day.reason = event.label || null
      } else {
        day.type = 'non_working'
        day.reason = event.label || null
      }
    }
  }

  return days
}
