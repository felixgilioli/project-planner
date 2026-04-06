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
import {
  calculateCascadeImpact,
  applyCascade,
  type CascadeResult,
  type DeploymentResolution,
} from '@/lib/cascade/recalculate'
import { calculateDeploymentDate } from '@/lib/deployment/calculator'

const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5]

async function syncFeatureStatus(featureId: string, tenantId: string): Promise<void> {
  const [featureRow, acts] = await Promise.all([
    db
      .select({ status: features.status })
      .from(features)
      .where(and(eq(features.id, featureId), eq(features.tenantId, tenantId)))
      .limit(1),
    db
      .select({ status: activities.status })
      .from(activities)
      .where(and(eq(activities.featureId, featureId), eq(activities.tenantId, tenantId))),
  ])

  if (!featureRow[0] || featureRow[0].status === 'blocked' || acts.length === 0) return

  const allDone = acts.every((a) => a.status === 'done')
  const anyActive = acts.some((a) => a.status === 'in_progress' || a.status === 'done')

  const newStatus = allDone ? 'done' : anyActive ? 'in_progress' : 'backlog'

  if (newStatus !== featureRow[0].status) {
    await db
      .update(features)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(and(eq(features.id, featureId), eq(features.tenantId, tenantId)))
  }
}

async function syncFeatureDeploymentDate(
  featureId: string,
  projectId: string,
  tenantId: string,
): Promise<void> {
  const [feature] = await db
    .select({
      estimatedEndDate: features.estimatedEndDate,
      deploymentDate: features.deploymentDate,
      deploymentDateManual: features.deploymentDateManual,
    })
    .from(features)
    .where(and(eq(features.id, featureId), eq(features.tenantId, tenantId)))
    .limit(1)

  if (!feature || !feature.estimatedEndDate) {
    // No end date — clear deployment date if auto
    if (!feature?.deploymentDateManual) {
      await db
        .update(features)
        .set({ deploymentDate: null, updatedAt: new Date() })
        .where(and(eq(features.id, featureId), eq(features.tenantId, tenantId)))
    }
    return
  }

  const { estimatedEndDate, deploymentDate, deploymentDateManual } = feature

  if (!deploymentDateManual) {
    // Scenario 1: recalculate automatically
    const newDate = await calculateDeploymentDate(estimatedEndDate, projectId)
    await db
      .update(features)
      .set({ deploymentDate: newDate, updatedAt: new Date() })
      .where(and(eq(features.id, featureId), eq(features.tenantId, tenantId)))
  } else if (deploymentDate && estimatedEndDate > deploymentDate) {
    // Scenario 3: development passed deployment date — auto-recalculate, reset manual
    const newDate = await calculateDeploymentDate(estimatedEndDate, projectId)
    await db
      .update(features)
      .set({ deploymentDate: newDate, deploymentDateManual: false, updatedAt: new Date() })
      .where(and(eq(features.id, featureId), eq(features.tenantId, tenantId)))
  }
  // Scenario 2 (manual and valid): no change in this path
}

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

  // Pre-compute all end dates before entering the transaction (pure calculation, no DB writes)
  const activityUpdates = projectActivities
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

      return { id: activity.id, estimatedEndDate }
    })

  const projectFeatures = await db
    .select({ id: features.id })
    .from(features)
    .where(and(eq(features.projectId, projectId), eq(features.tenantId, tenantId)))

  await db.transaction(async (tx) => {
    // Update all activity end dates atomically
    await Promise.all(
      activityUpdates.map(({ id, estimatedEndDate }) =>
        tx.update(activities).set({ estimatedEndDate, updatedAt: new Date() }).where(eq(activities.id, id)),
      ),
    )

    // Sync feature dates from the now-updated activities
    await Promise.all(
      projectFeatures.map(async (f) => {
        const acts = await tx
          .select({ startDate: activities.startDate, estimatedEndDate: activities.estimatedEndDate })
          .from(activities)
          .where(and(eq(activities.featureId, f.id), eq(activities.tenantId, tenantId)))

        const startDates = acts.map((a) => a.startDate).filter((d): d is Date => d != null)
        const endDates = acts.map((a) => a.estimatedEndDate).filter((d): d is Date => d != null)

        const startDate = startDates.length > 0 ? startDates.reduce((min, d) => (d < min ? d : min)) : null
        const estimatedEndDate = endDates.length > 0 ? endDates.reduce((max, d) => (d > max ? d : max)) : null

        await tx
          .update(features)
          .set({ startDate, estimatedEndDate, updatedAt: new Date() })
          .where(and(eq(features.id, f.id), eq(features.tenantId, tenantId)))
      }),
    )
  })
}

export async function getActivities(featureId: string) {
  const tenantId = await getAuthenticatedTenantId()

  return db
    .select()
    .from(activities)
    .where(and(eq(activities.featureId, featureId), eq(activities.tenantId, tenantId)))
    .orderBy(asc(activities.displayOrder), asc(activities.createdAt))
}

export async function getProjectActivitiesProgress(projectId: string) {
  const tenantId = await getAuthenticatedTenantId()

  return db
    .select({
      featureId: activities.featureId,
      progress: activities.progress,
      estimatedHours: activities.estimatedHours,
    })
    .from(activities)
    .innerJoin(features, eq(activities.featureId, features.id))
    .where(and(eq(features.projectId, projectId), eq(activities.tenantId, tenantId)))
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

  await Promise.all([syncFeatureDates(featureId, tenantId), syncFeatureStatus(featureId, tenantId)])
  await syncFeatureDeploymentDate(featureId, feature.projectId, tenantId)
  revalidatePath(`/projects/${feature.projectId}/features`)
}

function progressToStatus(progress: number): string {
  if (progress === 0) return 'backlog'
  if (progress === 100) return 'done'
  return 'in_progress'
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
    progress?: number
    displayOrder?: number
  }
): Promise<{ requiresConfirmation: false } | { requiresConfirmation: true; cascadeResult: CascadeResult }> {
  updateActivitySchema.parse(data)
  const tenantId = await getAuthenticatedTenantId()

  // Derive status from progress when progress is provided
  if (data.progress !== undefined && data.status === undefined) {
    data = { ...data, status: progressToStatus(data.progress) }
  }

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

  const cascadeResult = await calculateCascadeImpact(id, data, tenantId)

  if (cascadeResult.hasImpact) {
    return { requiresConfirmation: true, cascadeResult }
  }

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

  const { estimatedHours, progress, ...rest } = data
  await db
    .update(activities)
    .set({
      ...rest,
      ...(estimatedHours !== undefined ? { estimatedHours: String(estimatedHours) } : {}),
      ...(progress !== undefined ? { progress } : {}),
      estimatedEndDate,
      updatedAt: new Date(),
    })
    .where(and(eq(activities.id, id), eq(activities.tenantId, tenantId)))

  await Promise.all([syncFeatureDates(activity.featureId, tenantId), syncFeatureStatus(activity.featureId, tenantId)])
  await syncFeatureDeploymentDate(activity.featureId, activity.projectId, tenantId)
  revalidatePath(`/projects/${activity.projectId}/features`)
  return { requiresConfirmation: false }
}

export async function confirmActivityUpdate(
  activityId: string,
  data: {
    name?: string
    startDate?: Date | null
    dependsOnId?: string | null
    estimatedHours?: number
    assignedMemberId?: string | null
    status?: string
    progress?: number
    displayOrder?: number
  },
  deploymentResolutions?: DeploymentResolution[],
): Promise<{ impactedCount: number }> {
  updateActivitySchema.parse(data)
  const tenantId = await getAuthenticatedTenantId()

  if (data.progress !== undefined && data.status === undefined) {
    data = { ...data, status: progressToStatus(data.progress) }
  }

  const [activity] = await db
    .select({
      featureId: activities.featureId,
      projectId: features.projectId,
    })
    .from(activities)
    .innerJoin(features, eq(activities.featureId, features.id))
    .where(and(eq(activities.id, activityId), eq(activities.tenantId, tenantId)))
    .limit(1)

  if (!activity) throw new Error('Atividade não encontrada')

  // Always recalculate on the server — never trust the cascadeResult from the client
  const cascadeResult = await calculateCascadeImpact(activityId, data, tenantId)

  await applyCascade(activityId, data, cascadeResult, tenantId, deploymentResolutions)
  await Promise.all([syncFeatureDates(activity.featureId, tenantId), syncFeatureStatus(activity.featureId, tenantId)])
  revalidatePath(`/projects/${activity.projectId}/features`)
  return { impactedCount: cascadeResult.impactedItems.length }
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

  await Promise.all([syncFeatureDates(activity.featureId, tenantId), syncFeatureStatus(activity.featureId, tenantId)])
  await syncFeatureDeploymentDate(activity.featureId, activity.projectId, tenantId)
  revalidatePath(`/projects/${activity.projectId}/features`)
}
