import { eq, and, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { deploymentSettings, calendars, calendarEvents } from '@/lib/db/schema'
import { type CalendarEventData, type CalendarEventType } from '@/lib/calendar-utils'

const WEEKDAY_MAP: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

/**
 * Calculate the first valid deployment date after estimatedEndDate.
 * Respects: blocked weekdays from settings, holidays from calendar.
 */
export async function calculateDeploymentDate(
  estimatedEndDate: Date,
  projectId: string,
): Promise<Date> {
  // Fetch deployment settings
  const [settings] = await db
    .select()
    .from(deploymentSettings)
    .where(eq(deploymentSettings.projectId, projectId))
    .limit(1)

  const blockedWeekdays = settings?.blockedWeekdays ?? ['saturday', 'sunday']
  const blockedDayNumbers = new Set(
    blockedWeekdays.map((d) => WEEKDAY_MAP[d]).filter((n) => n !== undefined),
  )

  // Fetch calendar events (holidays) for the project
  const calRows = await db
    .select()
    .from(calendars)
    .where(eq(calendars.projectId, projectId))

  let holidayDates = new Set<string>()
  let projectWorkingDays = new Set([1, 2, 3, 4, 5]) // default Mon-Fri

  if (calRows.length > 0) {
    const primaryCal = calRows[0]
    projectWorkingDays = new Set(primaryCal.workingDays)

    const calIds = calRows.map((c) => c.id)
    const eventRows = await db
      .select({
        id: calendarEvents.id,
        type: calendarEvents.type,
        startDate: calendarEvents.startDate,
        endDate: calendarEvents.endDate,
        memberId: calendarEvents.memberId,
        label: calendarEvents.label,
      })
      .from(calendarEvents)
      .where(
        and(
          inArray(calendarEvents.calendarId, calIds),
        ),
      )

    for (const event of eventRows) {
      if (event.type === 'holiday') {
        // Expand date range
        const end = new Date(event.endDate + 'T12:00:00')
        for (
          let d = new Date(event.startDate + 'T12:00:00');
          d <= end;
          d.setDate(d.getDate() + 1)
        ) {
          holidayDates.add(d.toISOString().slice(0, 10))
        }
      }
    }
  }

  // Start from day after estimatedEndDate
  const candidate = new Date(estimatedEndDate)
  candidate.setUTCHours(12, 0, 0, 0)
  candidate.setUTCDate(candidate.getUTCDate() + 1)

  // Find first valid deployment day (max 365 iterations as safety cap)
  for (let i = 0; i < 365; i++) {
    const dayOfWeek = candidate.getUTCDay()
    const dateStr = candidate.toISOString().slice(0, 10)

    const isBlockedBySettings = blockedDayNumbers.has(dayOfWeek)
    const isHoliday = holidayDates.has(dateStr)
    const isNonWorkingBase = !projectWorkingDays.has(dayOfWeek)

    if (!isBlockedBySettings && !isHoliday && !isNonWorkingBase) {
      return new Date(candidate)
    }

    candidate.setUTCDate(candidate.getUTCDate() + 1)
  }

  // Fallback: return day after estimatedEndDate
  const fallback = new Date(estimatedEndDate)
  fallback.setUTCDate(fallback.getUTCDate() + 1)
  return fallback
}
