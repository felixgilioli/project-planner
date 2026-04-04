// Pure calendar helpers — no 'use server', safe to import in client components
// Also exports calendar-aware end-date calculation used by server actions

export type CalendarEventType = 'holiday' | 'vacation' | 'day_off' | 'freeze' | 'extra_working'

export type CalendarDayData = {
  date: string // 'YYYY-MM-DD'
  type: 'working' | 'non_working'
  reason: string | null
  eventType?: CalendarEventType // dominant event type (last processed), used for visual hints
  events: CalendarEventData[]  // all events covering this day
}

export type CalendarEventData = {
  id: string
  type: CalendarEventType
  startDate: string // 'YYYY-MM-DD'
  endDate: string   // 'YYYY-MM-DD'
  memberId: string | null
  memberName?: string | null // populated via join in getCalendar
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
      events: [],
    })
  }

  return days
}

// ─── Calendar-aware end date calculation ─────────────────────────────────────

export type CalendarContext = {
  workingDays: number[]
  globalBlockedDates: Set<string> // holidays — 'YYYY-MM-DD'
  memberBlockedDates: Set<string> // vacation/day_off for the assigned member
  extraWorkingDates: Set<string>  // extra_working overrides
}

function expandDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  const end = new Date(endDate + 'T12:00:00')
  for (let d = new Date(startDate + 'T12:00:00'); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

export function buildCalendarContext(
  workingDays: number[],
  events: CalendarEventData[],
  memberId: string | null,
): CalendarContext {
  const globalBlockedDates = new Set<string>()
  const memberBlockedDates = new Set<string>()
  const extraWorkingDates = new Set<string>()

  for (const event of events) {
    const dates = expandDateRange(event.startDate, event.endDate)
    if (event.type === 'extra_working') {
      for (const d of dates) extraWorkingDates.add(d)
    } else if (event.type === 'holiday') {
      for (const d of dates) globalBlockedDates.add(d)
    } else if (
      (event.type === 'vacation' || event.type === 'day_off') &&
      memberId !== null &&
      event.memberId === memberId
    ) {
      for (const d of dates) memberBlockedDates.add(d)
    }
    // freeze → informational only, ignored
  }

  return { workingDays, globalBlockedDates, memberBlockedDates, extraWorkingDates }
}

export function calcEndDateWithCalendar(
  startDate: Date,
  estimatedHours: number,
  dailyCapacityHours: number,
  ctx: CalendarContext,
): Date | null {
  if (estimatedHours <= 0 || dailyCapacityHours <= 0) return null

  const daysNeeded = Math.ceil(estimatedHours / dailyCapacityHours)
  const workingSet = new Set(ctx.workingDays)

  // Normalise to UTC noon to avoid DST drift when calling setUTCDate
  const current = new Date(startDate)
  current.setUTCHours(12, 0, 0, 0)

  let counted = 0
  const maxIter = daysNeeded * 10 + 730 // safety cap

  for (let i = 0; i < maxIter; i++) {
    const dateStr = current.toISOString().slice(0, 10)
    const isExtra = ctx.extraWorkingDates.has(dateStr)
    const isHoliday = ctx.globalBlockedDates.has(dateStr)
    const isMemberOff = ctx.memberBlockedDates.has(dateStr)
    const baseWorking = workingSet.has(current.getUTCDay())

    const valid = (isExtra || baseWorking) && !isHoliday && !isMemberOff

    if (valid) {
      counted++
      if (counted === daysNeeded) return new Date(current)
    }

    current.setUTCDate(current.getUTCDate() + 1)
  }

  return null // safety cap reached (misconfigured calendar)
}

// ─── Year-grid helpers ────────────────────────────────────────────────────────

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

      day.eventType = event.type
      day.reason = event.label || null
      day.events.push(event)

      if (event.type === 'extra_working') {
        day.type = 'working'
      } else if (event.type === 'freeze' || event.type === 'vacation' || event.type === 'day_off') {
        // informational only — day keeps its base type (member-specific, no global impact)
      } else {
        // holiday → non_working for the whole project
        day.type = 'non_working'
      }
    }
  }

  return days
}
