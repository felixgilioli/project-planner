'use server'

import { revalidatePath } from 'next/cache'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { projects, calendars, calendarEvents, teamMembers } from '@/lib/db/schema'
import { getAuthenticatedTenantId } from '@/lib/auth'
import { workingDaysSchema, calendarEventSchema } from '@/lib/validations/calendar'
import {
  generateYearDays,
  computeDaysFromEvents,
  type CalendarDayData,
  type CalendarEventType,
  type CalendarEventData,
} from '@/lib/calendar-utils'
import { z } from 'zod'

// Re-export types consumed by client components
export type { CalendarDayData, CalendarEventType, CalendarEventData }

// ─── Types ────────────────────────────────────────────────────────────────────

export type CalendarResult = {
  calendarId: string | null
  events: CalendarEventData[]
  days: CalendarDayData[]     // computed from events + workingDays config
  workingDaysCount: number
  workingDays: number[]
}

const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5]

// ─── Server Actions ───────────────────────────────────────────────────────────

export async function getCalendar(projectId: string, year: number): Promise<CalendarResult> {
  const tenantId = await getAuthenticatedTenantId()

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1)

  if (!project) throw new Error('Projeto não encontrado')

  const [calendar] = await db
    .select()
    .from(calendars)
    .where(and(eq(calendars.projectId, projectId), eq(calendars.year, year)))
    .limit(1)

  if (!calendar) {
    const workingDays = DEFAULT_WORKING_DAYS
    const days = generateYearDays(year, workingDays)
    return {
      calendarId: null,
      events: [],
      days,
      workingDaysCount: days.filter((d) => d.type === 'working').length,
      workingDays,
    }
  }

  const dbEvents = await db
    .select({
      id: calendarEvents.id,
      type: calendarEvents.type,
      startDate: calendarEvents.startDate,
      endDate: calendarEvents.endDate,
      memberId: calendarEvents.memberId,
      label: calendarEvents.label,
      memberName: teamMembers.name,
    })
    .from(calendarEvents)
    .leftJoin(teamMembers, eq(calendarEvents.memberId, teamMembers.id))
    .where(eq(calendarEvents.calendarId, calendar.id))

  const events: CalendarEventData[] = dbEvents.map((e) => ({
    id: e.id,
    type: e.type as CalendarEventType,
    startDate: e.startDate,
    endDate: e.endDate,
    memberId: e.memberId,
    memberName: e.memberName ?? null,
    label: e.label,
  }))

  const days = computeDaysFromEvents(year, calendar.workingDays, events)

  return {
    calendarId: calendar.id,
    events,
    days,
    workingDaysCount: days.filter((d) => d.type === 'working').length,
    workingDays: calendar.workingDays,
  }
}

export async function saveCalendar(
  projectId: string,
  year: number,
  events: Omit<CalendarEventData, 'id'>[],
  workingDays: number[] = DEFAULT_WORKING_DAYS,
): Promise<void> {
  workingDaysSchema.parse(workingDays)
  z.array(calendarEventSchema).parse(events)

  const tenantId = await getAuthenticatedTenantId()

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1)

  if (!project) throw new Error('Projeto não encontrado')

  // Upsert calendar record
  const [calendar] = await db
    .insert(calendars)
    .values({ tenantId, projectId, year, workingDays })
    .onConflictDoUpdate({
      target: [calendars.projectId, calendars.year],
      set: { workingDays, updatedAt: new Date() },
    })
    .returning()

  // Replace all events for this calendar
  await db.delete(calendarEvents).where(eq(calendarEvents.calendarId, calendar.id))

  if (events.length > 0) {
    await db.insert(calendarEvents).values(
      events.map((e) => ({
        tenantId,
        calendarId: calendar.id,
        type: e.type,
        startDate: e.startDate,
        endDate: e.endDate,
        memberId: e.memberId,
        label: e.label,
      })),
    )
  }

  revalidatePath(`/projects/${projectId}/calendar`)
}
