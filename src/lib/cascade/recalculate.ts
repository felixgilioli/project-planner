import { eq, and, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { activities, features, teamMembers, calendars, calendarEvents } from '@/lib/db/schema'
import {
  calcEndDateWithCalendar,
  buildCalendarContext,
  type CalendarContext,
  type CalendarEventData,
  type CalendarEventType,
} from '@/lib/calendar-utils'

// ─── Exported types ───────────────────────────────────────────────────────────

export type ImpactedItem = {
  type: 'activity' | 'feature'
  id: string
  name: string
  oldStartDate: string | null // ISO 8601
  newStartDate: string | null
  oldEndDate: string | null
  newEndDate: string | null
}

export type CascadeResult = {
  impactedItems: ImpactedItem[]
  hasImpact: boolean
  editedActivityEndDate: Date | null
}

export class CircularDependencyError extends Error {
  constructor() {
    super('Dependência circular detectada. Verifique as dependências antes de continuar.')
    this.name = 'CircularDependencyError'
  }
}

// ─── Internal types ───────────────────────────────────────────────────────────

type ActivityNode = {
  id: string
  featureId: string
  name: string
  startDate: Date | null
  estimatedEndDate: Date | null
  estimatedHours: string
  assignedMemberId: string | null
  dependsOnId: string | null
  displayOrder: number
  dailyCapacityHours: string | null
}

type FeatureNode = {
  id: string
  projectId: string
  name: string
  startDate: Date | null
  estimatedEndDate: Date | null
  dependsOnId: string | null
}

type UpdateActivityData = {
  name?: string
  startDate?: Date | null
  dependsOnId?: string | null
  estimatedHours?: number
  assignedMemberId?: string | null
  status?: string
  displayOrder?: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nextWorkingDay(endDate: Date, ctx: CalendarContext): Date {
  const next = new Date(endDate)
  next.setUTCDate(next.getUTCDate() + 1)
  next.setUTCHours(12, 0, 0, 0)
  // calcEndDateWithCalendar with 1h and 1h/day capacity returns the first valid working day
  return calcEndDateWithCalendar(next, 1, 1, ctx) ?? next
}

function isoOrNull(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null
}

// ─── Main: calculateCascadeImpact ─────────────────────────────────────────────

export async function calculateCascadeImpact(
  activityId: string,
  newData: UpdateActivityData,
  tenantId: string,
): Promise<CascadeResult> {
  // ── Query 1: fetch the edited activity + its projectId ──────────────────
  const [editedRow] = await db
    .select({
      id: activities.id,
      featureId: activities.featureId,
      name: activities.name,
      startDate: activities.startDate,
      estimatedEndDate: activities.estimatedEndDate,
      estimatedHours: activities.estimatedHours,
      assignedMemberId: activities.assignedMemberId,
      dependsOnId: activities.dependsOnId,
      displayOrder: activities.displayOrder,
      projectId: features.projectId,
    })
    .from(activities)
    .innerJoin(features, eq(activities.featureId, features.id))
    .where(and(eq(activities.id, activityId), eq(activities.tenantId, tenantId)))
    .limit(1)

  if (!editedRow) throw new Error('Atividade não encontrada')

  const { projectId } = editedRow

  // ── Query 2: fetch ALL activities for the project ───────────────────────
  const allActivityRows = await db
    .select({
      id: activities.id,
      featureId: activities.featureId,
      name: activities.name,
      startDate: activities.startDate,
      estimatedEndDate: activities.estimatedEndDate,
      estimatedHours: activities.estimatedHours,
      assignedMemberId: activities.assignedMemberId,
      dependsOnId: activities.dependsOnId,
      displayOrder: activities.displayOrder,
      dailyCapacityHours: teamMembers.dailyCapacityHours,
    })
    .from(activities)
    .innerJoin(features, eq(activities.featureId, features.id))
    .leftJoin(teamMembers, eq(activities.assignedMemberId, teamMembers.id))
    .where(and(eq(features.projectId, projectId), eq(activities.tenantId, tenantId)))

  // ── Query 3: fetch ALL features for the project ─────────────────────────
  const allFeatureRows = await db
    .select({
      id: features.id,
      projectId: features.projectId,
      name: features.name,
      startDate: features.startDate,
      estimatedEndDate: features.estimatedEndDate,
      dependsOnId: features.dependsOnId,
    })
    .from(features)
    .where(and(eq(features.projectId, projectId), eq(features.tenantId, tenantId)))

  // ── Query 4: fetch calendar data ────────────────────────────────────────
  const calRows = await db
    .select()
    .from(calendars)
    .where(eq(calendars.projectId, projectId))

  let workingDays = [1, 2, 3, 4, 5]
  let calEventRows: Array<{
    id: string
    type: string
    startDate: string
    endDate: string
    memberId: string | null
    label: string
  }> = []

  if (calRows.length > 0) {
    const primaryCal = calRows[0]
    workingDays = primaryCal.workingDays

    const calIds = calRows.map((c) => c.id)
    calEventRows = await db
      .select({
        id: calendarEvents.id,
        type: calendarEvents.type,
        startDate: calendarEvents.startDate,
        endDate: calendarEvents.endDate,
        memberId: calendarEvents.memberId,
        label: calendarEvents.label,
      })
      .from(calendarEvents)
      .where(inArray(calendarEvents.calendarId, calIds))
  }

  const calEvents: CalendarEventData[] = calEventRows.map((e) => ({
    id: e.id,
    type: e.type as CalendarEventType,
    startDate: e.startDate,
    endDate: e.endDate,
    memberId: e.memberId,
    memberName: null,
    label: e.label,
  }))

  // Build memoized CalendarContext per memberId
  const ctxCache = new Map<string | null, CalendarContext>()
  function getCtx(memberId: string | null): CalendarContext {
    const key = memberId ?? '__none__'
    if (!ctxCache.has(key)) {
      ctxCache.set(key, buildCalendarContext(workingDays, calEvents, memberId))
    }
    return ctxCache.get(key)!
  }

  // Build lookup maps
  const activityMap = new Map<string, ActivityNode>()
  const activitiesByFeature = new Map<string, ActivityNode[]>()
  const dependentsByActivity = new Map<string, string[]>() // dependsOnId → [id, ...]

  for (const row of allActivityRows) {
    const node: ActivityNode = { ...row }
    activityMap.set(row.id, node)

    if (!activitiesByFeature.has(row.featureId)) activitiesByFeature.set(row.featureId, [])
    activitiesByFeature.get(row.featureId)!.push(node)

    if (row.dependsOnId) {
      if (!dependentsByActivity.has(row.dependsOnId)) dependentsByActivity.set(row.dependsOnId, [])
      dependentsByActivity.get(row.dependsOnId)!.push(row.id)
    }
  }

  const featureMap = new Map<string, FeatureNode>()
  const dependentsByFeature = new Map<string, string[]>()

  for (const row of allFeatureRows) {
    featureMap.set(row.id, row)
    if (row.dependsOnId) {
      if (!dependentsByFeature.has(row.dependsOnId)) dependentsByFeature.set(row.dependsOnId, [])
      dependentsByFeature.get(row.dependsOnId)!.push(row.id)
    }
  }

  // ── Step 1: Circular dependency detection ──────────────────────────────
  if ('dependsOnId' in newData && newData.dependsOnId) {
    let cursor: string | null = newData.dependsOnId
    const visited = new Set<string>()
    while (cursor) {
      if (cursor === activityId) throw new CircularDependencyError()
      if (visited.has(cursor)) break
      visited.add(cursor)
      cursor = activityMap.get(cursor)?.dependsOnId ?? null
    }
  }

  // ── Step 2: Compute edited activity's new estimatedEndDate ─────────────
  const effectiveStartDate =
    'startDate' in newData ? newData.startDate : editedRow.startDate
  const effectiveHours =
    newData.estimatedHours !== undefined
      ? newData.estimatedHours
      : parseFloat(editedRow.estimatedHours ?? '0')
  const effectiveMemberId =
    'assignedMemberId' in newData ? newData.assignedMemberId : editedRow.assignedMemberId

  let newEndDate: Date | null = null
  if (effectiveStartDate && effectiveMemberId) {
    const memberNode = activityMap.get(activityId)
    const dailyHours = memberNode?.dailyCapacityHours
      ? parseFloat(memberNode.dailyCapacityHours)
      : null

    // Re-fetch daily capacity for the potentially new member
    let resolvedDailyHours: number | null = dailyHours
    if (effectiveMemberId !== editedRow.assignedMemberId) {
      const [memberRow] = await db
        .select({ dailyCapacityHours: teamMembers.dailyCapacityHours })
        .from(teamMembers)
        .where(eq(teamMembers.id, effectiveMemberId))
        .limit(1)
      resolvedDailyHours = memberRow ? parseFloat(memberRow.dailyCapacityHours) : null
    }

    if (resolvedDailyHours && resolvedDailyHours > 0 && effectiveHours > 0) {
      newEndDate = calcEndDateWithCalendar(
        effectiveStartDate,
        effectiveHours,
        resolvedDailyHours,
        getCtx(effectiveMemberId),
      )
    }
  }

  // Compare with existing end date via ISO string
  const oldEndIso = isoOrNull(editedRow.estimatedEndDate)
  const newEndIso = isoOrNull(newEndDate)

  if (oldEndIso === newEndIso) {
    return { hasImpact: false, impactedItems: [], editedActivityEndDate: newEndDate }
  }

  // Working overrides: tracks recomputed dates for activities
  const activityOverrides = new Map<string, { newStartDate: Date | null; newEndDate: Date | null }>()
  activityOverrides.set(activityId, {
    newStartDate: effectiveStartDate ?? null,
    newEndDate,
  })

  // ── Step 3: BFS propagation through dependent activities ───────────────
  const actQueue: string[] = [activityId]
  while (actQueue.length > 0) {
    const predId = actQueue.shift()!
    const predOverride = activityOverrides.get(predId)!
    if (!predOverride.newEndDate) continue

    for (const depId of dependentsByActivity.get(predId) ?? []) {
      const dep = activityMap.get(depId)
      if (!dep) continue

      const candidateStart = nextWorkingDay(predOverride.newEndDate, getCtx(dep.assignedMemberId))

      // Only push forward — never compress timelines
      if (dep.startDate !== null && candidateStart <= dep.startDate) continue

      let depNewEnd: Date | null = null
      if (dep.assignedMemberId && dep.dailyCapacityHours) {
        const depDailyHours = parseFloat(dep.dailyCapacityHours)
        const depHours = parseFloat(dep.estimatedHours)
        if (depDailyHours > 0 && depHours > 0) {
          depNewEnd = calcEndDateWithCalendar(
            candidateStart,
            depHours,
            depDailyHours,
            getCtx(dep.assignedMemberId),
          )
        }
      }

      activityOverrides.set(depId, { newStartDate: candidateStart, newEndDate: depNewEnd })
      actQueue.push(depId)
    }
  }

  // ── Step 4: Recompute feature dates for affected features ──────────────
  const affectedFeatureIds = new Set<string>()
  for (const id of activityOverrides.keys()) {
    const act = activityMap.get(id)
    if (act) affectedFeatureIds.add(act.featureId)
  }

  const featureOverrides = new Map<string, { newStartDate: Date | null; newEndDate: Date | null }>()

  for (const fId of affectedFeatureIds) {
    const feat = featureMap.get(fId)
    if (!feat) continue

    const featureActs = activitiesByFeature.get(fId) ?? []
    const starts: Date[] = []
    const ends: Date[] = []

    for (const act of featureActs) {
      const override = activityOverrides.get(act.id)
      const start = override ? override.newStartDate : act.startDate
      const end = override ? override.newEndDate : act.estimatedEndDate
      if (start) starts.push(start)
      if (end) ends.push(end)
    }

    const newFeatStart = starts.length > 0 ? starts.reduce((min, d) => (d < min ? d : min)) : null
    const newFeatEnd = ends.length > 0 ? ends.reduce((max, d) => (d > max ? d : max)) : null

    const featStartIso = isoOrNull(feat.startDate)
    const featEndIso = isoOrNull(feat.estimatedEndDate)
    const newFeatStartIso = isoOrNull(newFeatStart)
    const newFeatEndIso = isoOrNull(newFeatEnd)

    if (newFeatStartIso !== featStartIso || newFeatEndIso !== featEndIso) {
      featureOverrides.set(fId, { newStartDate: newFeatStart, newEndDate: newFeatEnd })
    }
  }

  // ── Step 5: BFS propagation through dependent features ─────────────────
  const globalCtx = getCtx(null) // no member-specific blocks for feature-level propagation

  const visitedFeatures = new Set<string>()
  const featQueue: string[] = [...featureOverrides.keys()]
  while (featQueue.length > 0) {
    const predFeatId = featQueue.shift()!
    if (visitedFeatures.has(predFeatId)) continue
    visitedFeatures.add(predFeatId)
    const predFeatOverride = featureOverrides.get(predFeatId)!
    if (!predFeatOverride.newEndDate) continue

    for (const depFeatId of dependentsByFeature.get(predFeatId) ?? []) {
      const depFeat = featureMap.get(depFeatId)
      if (!depFeat) continue

      const dayAfter = nextWorkingDay(predFeatOverride.newEndDate, globalCtx)

      // Only push forward
      if (depFeat.startDate !== null && dayAfter <= depFeat.startDate) continue

      // Find the first activity in the dependent feature (by earliest startDate or lowest displayOrder)
      const depFeatureActs = (activitiesByFeature.get(depFeatId) ?? []).slice().sort((a, b) => {
        if (a.startDate && b.startDate) return a.startDate.getTime() - b.startDate.getTime()
        if (a.startDate) return -1
        if (b.startDate) return 1
        return a.displayOrder - b.displayOrder
      })

      if (depFeatureActs.length === 0) continue

      // Shift the first activity to dayAfter and cascade through the feature's activities
      const rootAct = depFeatureActs[0]
      const rootNewEnd = rootAct.assignedMemberId && rootAct.dailyCapacityHours
        ? calcEndDateWithCalendar(
            dayAfter,
            parseFloat(rootAct.estimatedHours),
            parseFloat(rootAct.dailyCapacityHours),
            getCtx(rootAct.assignedMemberId),
          )
        : null

      activityOverrides.set(rootAct.id, { newStartDate: dayAfter, newEndDate: rootNewEnd })

      // Cascade from root activity through the feature
      const innerQueue: string[] = [rootAct.id]
      while (innerQueue.length > 0) {
        const innerPredId = innerQueue.shift()!
        const innerOverride = activityOverrides.get(innerPredId)!
        if (!innerOverride.newEndDate) continue

        for (const innerDepId of dependentsByActivity.get(innerPredId) ?? []) {
          const innerDep = activityMap.get(innerDepId)
          if (!innerDep || innerDep.featureId !== depFeatId) continue

          const innerStart = nextWorkingDay(innerOverride.newEndDate, getCtx(innerDep.assignedMemberId))
          if (innerDep.startDate !== null && innerStart <= innerDep.startDate) continue

          let innerEnd: Date | null = null
          if (innerDep.assignedMemberId && innerDep.dailyCapacityHours) {
            const h = parseFloat(innerDep.estimatedHours)
            const cap = parseFloat(innerDep.dailyCapacityHours)
            if (h > 0 && cap > 0) {
              innerEnd = calcEndDateWithCalendar(innerStart, h, cap, getCtx(innerDep.assignedMemberId))
            }
          }
          activityOverrides.set(innerDepId, { newStartDate: innerStart, newEndDate: innerEnd })
          innerQueue.push(innerDepId)
        }
      }

      // Recompute dependent feature dates from all its activities
      const depFeatureActsAll = activitiesByFeature.get(depFeatId) ?? []
      const depStarts: Date[] = []
      const depEnds: Date[] = []
      for (const act of depFeatureActsAll) {
        const ov = activityOverrides.get(act.id)
        const s = ov ? ov.newStartDate : act.startDate
        const e = ov ? ov.newEndDate : act.estimatedEndDate
        if (s) depStarts.push(s)
        if (e) depEnds.push(e)
      }
      const depFeatNewStart = depStarts.length > 0 ? depStarts.reduce((min, d) => (d < min ? d : min)) : null
      const depFeatNewEnd = depEnds.length > 0 ? depEnds.reduce((max, d) => (d > max ? d : max)) : null

      featureOverrides.set(depFeatId, { newStartDate: depFeatNewStart, newEndDate: depFeatNewEnd })
      featQueue.push(depFeatId)
    }
  }

  // ── Build CascadeResult ────────────────────────────────────────────────
  const impactedItems: ImpactedItem[] = []

  for (const [id, override] of activityOverrides) {
    if (id === activityId) continue // edited activity is the cause, not impacted
    const node = activityMap.get(id)!
    impactedItems.push({
      type: 'activity',
      id,
      name: node.name,
      oldStartDate: isoOrNull(node.startDate),
      newStartDate: isoOrNull(override.newStartDate),
      oldEndDate: isoOrNull(node.estimatedEndDate),
      newEndDate: isoOrNull(override.newEndDate),
    })
  }

  for (const [id, override] of featureOverrides) {
    const node = featureMap.get(id)!
    impactedItems.push({
      type: 'feature',
      id,
      name: node.name,
      oldStartDate: isoOrNull(node.startDate),
      newStartDate: isoOrNull(override.newStartDate),
      oldEndDate: isoOrNull(node.estimatedEndDate),
      newEndDate: isoOrNull(override.newEndDate),
    })
  }

  return { hasImpact: impactedItems.length > 0, impactedItems, editedActivityEndDate: newEndDate }
}

// ─── applyCascade ─────────────────────────────────────────────────────────────

export async function applyCascade(
  activityId: string,
  newData: UpdateActivityData,
  cascadeResult: CascadeResult,
  tenantId: string,
): Promise<void> {
  // Use the end date already computed during calculateCascadeImpact — no re-fetch needed
  const estimatedEndDate = cascadeResult.editedActivityEndDate

  await db.transaction(async (tx) => {
    // 1. Apply the edited activity's new values
    const { estimatedHours, ...rest } = newData
    await tx
      .update(activities)
      .set({
        ...rest,
        ...(estimatedHours !== undefined ? { estimatedHours: String(estimatedHours) } : {}),
        estimatedEndDate,
        updatedAt: new Date(),
      })
      .where(and(eq(activities.id, activityId), eq(activities.tenantId, tenantId)))

    // 2. Apply impacted activities
    for (const item of cascadeResult.impactedItems) {
      if (item.type !== 'activity') continue
      await tx
        .update(activities)
        .set({
          startDate: item.newStartDate ? new Date(item.newStartDate) : null,
          estimatedEndDate: item.newEndDate ? new Date(item.newEndDate) : null,
          updatedAt: new Date(),
        })
        .where(and(eq(activities.id, item.id), eq(activities.tenantId, tenantId)))
    }

    // 3. Apply impacted features
    for (const item of cascadeResult.impactedItems) {
      if (item.type !== 'feature') continue
      await tx
        .update(features)
        .set({
          startDate: item.newStartDate ? new Date(item.newStartDate) : null,
          estimatedEndDate: item.newEndDate ? new Date(item.newEndDate) : null,
          updatedAt: new Date(),
        })
        .where(and(eq(features.id, item.id), eq(features.tenantId, tenantId)))
    }
  })
}
