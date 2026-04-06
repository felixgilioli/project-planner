'use server'

import { revalidatePath } from 'next/cache'
import { eq, and, asc, inArray, isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { activities, features, teamMembers, calendars, calendarEvents } from '@/lib/db/schema'
import { getAuthenticatedTenantId } from '@/lib/auth'
import {
  calcEndDateWithCalendar,
  buildCalendarContext,
  type CalendarEventData,
  type CalendarEventType,
} from '@/lib/calendar-utils'
import { createActivitySchema, updateActivitySchema } from '@/lib/validations/activity'

const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5]

async function syncFeatureDates(featureId: string, tenantId: string): Promise<void> {
  const acts = await db
    .select({ startDate: activities.startDate, estimatedEndDate: activities.estimatedEndDate })
    .from(activities)
    .where(and(eq(activities.featureId, featureId), eq(activities.tenantId, tenantId)))

  const startDates = acts.map((a) => a.startDate).filter((d): d is Date => d != null)
  const endDates = acts.map((a) => a.estimatedEndDate).filter((d): d is Date => d != null)

  const startDate = startDates.length > 0 ? startDates.reduce((min, d) => (d < min ? d : min)) : null
  const estimatedEndDate = endDates.length > 0 ? endDates.reduce((max, d) => (d > max ? d : max)) : null

  await db
    .update(features)
    .set({ startDate, estimatedEndDate, updatedAt: new Date() })
    .where(and(eq(features.id, featureId), eq(features.tenantId, tenantId)))
}

async function fetchCalendarEventsForProject(
  projectId: string,
  years: number[],
): Promise<{ workingDays: number[]; events: CalendarEventData[] }> {
  if (years.length === 0) return { workingDays: DEFAULT_WORKING_DAYS, events: [] }

  const calRows = await db
    .select()
    .from(calendars)
    .where(and(eq(calendars.projectId, projectId), inArray(calendars.year, years)))

  if (calRows.length === 0) return { workingDays: DEFAULT_WORKING_DAYS, events: [] }

  const calendarIds = calRows.map((c) => c.id)
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
    .where(inArray(calendarEvents.calendarId, calendarIds))

  const primaryCal = calRows.find((c) => c.year === years[0]) ?? calRows[0]

  const events: CalendarEventData[] = eventRows.map((e) => ({
    id: e.id,
    type: e.type as CalendarEventType,
    startDate: e.startDate,
    endDate: e.endDate,
    memberId: e.memberId,
    memberName: null,
    label: e.label,
  }))

  return { workingDays: primaryCal.workingDays, events }
}

async function resolveEstimatedEndDate(
  projectId: string,
  startDate: Date | null | undefined,
  estimatedHours: number,
  assignedMemberId: string | null | undefined,
): Promise<Date | null> {
  if (!startDate || !assignedMemberId || estimatedHours <= 0) return null

  const [member] = await db
    .select({ dailyCapacityHours: teamMembers.dailyCapacityHours })
    .from(teamMembers)
    .where(eq(teamMembers.id, assignedMemberId))
    .limit(1)
  if (!member) return null

  const startYear = startDate.getFullYear()
  const { workingDays, events } = await fetchCalendarEventsForProject(projectId, [
    startYear,
    startYear + 1,
  ])

  const ctx = buildCalendarContext(workingDays, events, assignedMemberId)
  return calcEndDateWithCalendar(startDate, estimatedHours, parseFloat(member.dailyCapacityHours), ctx)
}

export async function recalculateProjectActivities(
  projectId: string,
  tenantId: string,
): Promise<void> {
  // Fetch all calculable activities (need startDate + assignedMember + hours)
  const projectActivities = await db
    .select({
      id: activities.id,
      startDate: activities.startDate,
      estimatedHours: activities.estimatedHours,
      assignedMemberId: activities.assignedMemberId,
      dailyCapacityHours: teamMembers.dailyCapacityHours,
    })
    .from(activities)
    .innerJoin(features, eq(activities.featureId, features.id))
    .innerJoin(teamMembers, eq(activities.assignedMemberId, teamMembers.id))
    .where(
      and(
        eq(features.projectId, projectId),
        eq(activities.tenantId, tenantId),
        isNotNull(activities.startDate),
        isNotNull(activities.assignedMemberId),
      ),
    )

  if (projectActivities.length === 0) return

  // Fetch all calendars for the project (all years)
  const calRows = await db
    .select()
    .from(calendars)
    .where(eq(calendars.projectId, projectId))

  const calendarIds = calRows.map((c) => c.id)
  const calendarsByYear = new Map(calRows.map((c) => [c.year, c]))

  const eventRows =
    calendarIds.length > 0
      ? await db
          .select({
            id: calendarEvents.id,
            type: calendarEvents.type,
            startDate: calendarEvents.startDate,
            endDate: calendarEvents.endDate,
            memberId: calendarEvents.memberId,
            label: calendarEvents.label,
            calendarId: calendarEvents.calendarId,
          })
          .from(calendarEvents)
          .where(inArray(calendarEvents.calendarId, calendarIds))
      : []

  // Group events by calendarId
  const eventsByCalendarId = new Map<string, CalendarEventData[]>()
  for (const e of eventRows) {
    const list = eventsByCalendarId.get(e.calendarId) ?? []
    list.push({
      id: e.id,
      type: e.type as CalendarEventType,
      startDate: e.startDate,
      endDate: e.endDate,
      memberId: e.memberId,
      memberName: null,
      label: e.label,
    })
    eventsByCalendarId.set(e.calendarId, list)
  }

  await Promise.all(
    projectActivities
      .filter((a) => a.startDate && parseFloat(a.estimatedHours ?? '0') > 0)
      .map((activity) => {
        const startYear = activity.startDate!.getFullYear()
        const relevantCalIds = [startYear, startYear + 1]
          .map((y) => calendarsByYear.get(y)?.id)
          .filter(Boolean) as string[]

        const relevantEvents = relevantCalIds.flatMap(
          (id) => eventsByCalendarId.get(id) ?? [],
        )

        const primaryCal = calendarsByYear.get(startYear)
        const workingDays = primaryCal?.workingDays ?? DEFAULT_WORKING_DAYS

        const ctx = buildCalendarContext(workingDays, relevantEvents, activity.assignedMemberId!)
        const estimatedEndDate = calcEndDateWithCalendar(
          activity.startDate!,
          parseFloat(activity.estimatedHours ?? '0'),
          parseFloat(activity.dailyCapacityHours),
          ctx,
        )

        return db
          .update(activities)
          .set({ estimatedEndDate, updatedAt: new Date() })
          .where(eq(activities.id, activity.id))
      }),
  )

  // Sync derived dates on all features of the project
  const projectFeatures = await db
    .select({ id: features.id })
    .from(features)
    .where(and(eq(features.projectId, projectId), eq(features.tenantId, tenantId)))

  await Promise.all(projectFeatures.map((f) => syncFeatureDates(f.id, tenantId)))
}

export async function getActivities(featureId: string) {
  const tenantId = await getAuthenticatedTenantId()

  return db
    .select()
    .from(activities)
    .where(and(eq(activities.featureId, featureId), eq(activities.tenantId, tenantId)))
    .orderBy(asc(activities.displayOrder), asc(activities.createdAt))
}

export async function createActivity(
  featureId: string,
  data: {
    name: string
    startDate?: Date | null
    dependsOnId?: string | null
    estimatedHours?: number
    assignedMemberId?: string | null
  }
) {
  createActivitySchema.parse(data)
  const tenantId = await getAuthenticatedTenantId()

  const [feature] = await db
    .select({ projectId: features.projectId })
    .from(features)
    .where(and(eq(features.id, featureId), eq(features.tenantId, tenantId)))
    .limit(1)

  if (!feature) throw new Error('Feature não encontrada')

  const estimatedEndDate = await resolveEstimatedEndDate(
    feature.projectId,
    data.startDate,
    data.estimatedHours ?? 0,
    data.assignedMemberId,
  )

  await db.insert(activities).values({
    tenantId,
    featureId,
    name: data.name,
    startDate: data.startDate ?? null,
    dependsOnId: data.dependsOnId ?? null,
    estimatedHours: String(data.estimatedHours ?? 0),
    assignedMemberId: data.assignedMemberId ?? null,
    estimatedEndDate,
  })

  await syncFeatureDates(featureId, tenantId)
  revalidatePath(`/projects/${feature.projectId}/features`)
}

export async function updateActivity(
  id: string,
  data: {
    name?: string
    startDate?: Date | null
    dependsOnId?: string | null
    estimatedHours?: number
    assignedMemberId?: string | null
    status?: string
    displayOrder?: number
  }
) {
  updateActivitySchema.parse(data)
  const tenantId = await getAuthenticatedTenantId()

  const [activity] = await db
    .select({
      featureId: activities.featureId,
      startDate: activities.startDate,
      estimatedHours: activities.estimatedHours,
      assignedMemberId: activities.assignedMemberId,
      projectId: features.projectId,
    })
    .from(activities)
    .innerJoin(features, eq(activities.featureId, features.id))
    .where(and(eq(activities.id, id), eq(activities.tenantId, tenantId)))
    .limit(1)

  if (!activity) throw new Error('Atividade não encontrada')

  const effectiveStartDate = 'startDate' in data ? data.startDate : activity.startDate
  const effectiveEstimatedHours =
    data.estimatedHours !== undefined
      ? data.estimatedHours
      : parseFloat(activity.estimatedHours ?? '0')
  const effectiveMemberId =
    'assignedMemberId' in data ? data.assignedMemberId : activity.assignedMemberId

  const estimatedEndDate = await resolveEstimatedEndDate(
    activity.projectId,
    effectiveStartDate,
    effectiveEstimatedHours,
    effectiveMemberId,
  )

  const { estimatedHours, ...rest } = data
  await db
    .update(activities)
    .set({
      ...rest,
      ...(estimatedHours !== undefined ? { estimatedHours: String(estimatedHours) } : {}),
      estimatedEndDate,
      updatedAt: new Date(),
    })
    .where(and(eq(activities.id, id), eq(activities.tenantId, tenantId)))

  await syncFeatureDates(activity.featureId, tenantId)
  revalidatePath(`/projects/${activity.projectId}/features`)
}

export async function deleteActivity(id: string) {
  const tenantId = await getAuthenticatedTenantId()

  const [activity] = await db
    .select({
      featureId: activities.featureId,
      projectId: features.projectId,
    })
    .from(activities)
    .innerJoin(features, eq(activities.featureId, features.id))
    .where(and(eq(activities.id, id), eq(activities.tenantId, tenantId)))
    .limit(1)

  if (!activity) throw new Error('Atividade não encontrada')

  await db
    .delete(activities)
    .where(and(eq(activities.id, id), eq(activities.tenantId, tenantId)))

  await syncFeatureDates(activity.featureId, tenantId)
  revalidatePath(`/projects/${activity.projectId}/features`)
}
