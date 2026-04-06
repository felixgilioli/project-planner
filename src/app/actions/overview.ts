'use server'

import { eq, and, inArray, desc, asc, isNotNull, lt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { projects, features, activities, teamMembers, featureComments } from '@/lib/db/schema'
import { getAuthenticatedTenantId } from '@/lib/auth'

const OCCUPATION_REFERENCE_DAYS = 20 // 4-week window for utilization calc
const FREE_WINDOW_LOOK_AHEAD_DAYS = 30 // horizon for gap detection

type FreeWindowResult =
  | { type: 'no_dates' }
  | { type: 'gap'; from: Date; workingDays: number }
  | { type: 'occupied' }

function countWorkingDays(start: Date, end: Date): number {
  let count = 0
  const d = new Date(start)
  d.setHours(0, 0, 0, 0)
  const e = new Date(end)
  e.setHours(0, 0, 0, 0)
  while (d < e) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

function findNextFreeWindow(
  activities: { assignedMemberId: string | null; status: string; startDate: Date | null; estimatedEndDate: Date | null }[],
  memberId: string,
): FreeWindowResult {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const windowEnd = new Date(today)
  windowEnd.setDate(windowEnd.getDate() + FREE_WINDOW_LOOK_AHEAD_DAYS)

  const ranges = activities
    .filter(
      (a) =>
        a.assignedMemberId === memberId &&
        a.status !== 'done' &&
        a.startDate != null &&
        a.estimatedEndDate != null &&
        a.estimatedEndDate > today,
    )
    .map((a) => ({ start: new Date(a.startDate!), end: new Date(a.estimatedEndDate!) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  if (ranges.length === 0) return { type: 'no_dates' }

  // Merge overlapping/adjacent ranges
  const merged: { start: Date; end: Date }[] = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (!last || r.start > last.end) {
      merged.push({ start: new Date(r.start), end: new Date(r.end) })
    } else if (r.end > last.end) {
      last.end = new Date(r.end)
    }
  }

  let cursor = new Date(today)

  for (const range of merged) {
    if (range.end <= cursor) continue
    if (range.start > cursor) {
      const workingDays = countWorkingDays(cursor, range.start)
      if (workingDays > 0) return { type: 'gap', from: new Date(cursor), workingDays }
    }
    if (range.end > cursor) cursor = new Date(range.end)
  }

  // After all ranges — check if there's free time before window end
  if (cursor < windowEnd) {
    const workingDays = countWorkingDays(cursor, windowEnd)
    if (workingDays > 0) return { type: 'gap', from: new Date(cursor), workingDays }
  }

  return { type: 'occupied' }
}

export async function getOverviewData(projectId: string) {
  const tenantId = await getAuthenticatedTenantId()

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1)

  if (!project) return null

  const [projectFeatures, projectMembers] = await Promise.all([
    db
      .select()
      .from(features)
      .where(and(eq(features.projectId, projectId), eq(features.tenantId, tenantId))),
    db
      .select()
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.projectId, projectId),
          eq(teamMembers.tenantId, tenantId),
          eq(teamMembers.isActive, true),
        ),
      ),
  ])

  const featureIds = projectFeatures.map((f) => f.id)

  const blockedFeatureIds = projectFeatures.filter((f) => f.isBlocked).map((f) => f.id)

  const [projectActivities, recentCommentsRaw, blockedImpedimentCommentsRaw] = await Promise.all([
    featureIds.length > 0
      ? db
          .select()
          .from(activities)
          .where(and(eq(activities.tenantId, tenantId), inArray(activities.featureId, featureIds)))
      : Promise.resolve([]),
    featureIds.length > 0
      ? db
          .select({
            id: featureComments.id,
            featureId: featureComments.featureId,
            content: featureComments.content,
            type: featureComments.type,
            createdAt: featureComments.createdAt,
          })
          .from(featureComments)
          .where(
            and(
              eq(featureComments.tenantId, tenantId),
              inArray(featureComments.featureId, featureIds),
            ),
          )
          .orderBy(desc(featureComments.createdAt))
          .limit(5)
      : Promise.resolve([]),
    blockedFeatureIds.length > 0
      ? db
          .select({
            id: featureComments.id,
            featureId: featureComments.featureId,
            content: featureComments.content,
            createdAt: featureComments.createdAt,
          })
          .from(featureComments)
          .where(
            and(
              eq(featureComments.tenantId, tenantId),
              inArray(featureComments.featureId, blockedFeatureIds),
              eq(featureComments.type, 'impediment'),
            ),
          )
          .orderBy(desc(featureComments.createdAt))
      : Promise.resolve([]),
  ])

  function calcWeightedProgress(acts: typeof projectActivities): number {
    if (acts.length === 0) return 0
    let totalWeight = 0
    let weightedSum = 0
    for (const a of acts) {
      const w = parseFloat(a.estimatedHours ?? '0') || 1
      weightedSum += a.progress * w
      totalWeight += w
    }
    return Math.round(weightedSum / totalWeight)
  }

  // Metrics
  const totalFeatures = projectFeatures.length
  const overallProgress = calcWeightedProgress(projectActivities)

  const deliveryDate = projectFeatures
    .map((f) => f.estimatedEndDate)
    .filter((d): d is Date => d != null)
    .reduce<Date | null>((max, d) => (!max || d > max ? d : max), null)

  const openImpediments = blockedFeatureIds.length

  // Blocked features with their most recent impediment comment
  const lastImpedimentByFeature = new Map<string, { content: string; createdAt: Date }>()
  for (const c of blockedImpedimentCommentsRaw) {
    if (!lastImpedimentByFeature.has(c.featureId)) {
      lastImpedimentByFeature.set(c.featureId, { content: c.content, createdAt: c.createdAt })
    }
  }
  const blockedFeatures = projectFeatures
    .filter((f) => f.isBlocked)
    .map((f) => ({
      feature: f,
      lastImpediment: lastImpedimentByFeature.get(f.id) ?? null,
    }))

  // Feature progress
  const featureProgress = projectFeatures.map((feature) => {
    const acts = projectActivities.filter((a) => a.featureId === feature.id)
    const done = acts.filter((a) => a.status === 'done').length
    return {
      feature,
      totalActivities: acts.length,
      doneActivities: done,
      progressPercent: calcWeightedProgress(acts),
    }
  })

  // Team occupation
  const teamOccupation = projectMembers.map((member) => {
    const assigned = projectActivities.filter(
      (a) => a.assignedMemberId === member.id && a.status !== 'done',
    )
    const assignedHours = assigned.reduce((sum, a) => sum + parseFloat(a.estimatedHours ?? '0'), 0)
    const referenceHours = parseFloat(member.dailyCapacityHours) * OCCUPATION_REFERENCE_DAYS
    const utilizationPercent =
      referenceHours > 0 ? Math.round((assignedHours / referenceHours) * 100) : 0
    const nextFreeWindow = findNextFreeWindow(projectActivities, member.id)
    return { member, assignedHours, utilizationPercent, nextFreeWindow }
  })

  // Upcoming deployments: next 5 features with deploymentDate, sorted ascending
  const now = new Date()
  const upcomingDeployments = projectFeatures
    .filter((f) => f.deploymentDate != null)
    .sort((a, b) => a.deploymentDate!.getTime() - b.deploymentDate!.getTime())
    .slice(0, 5)

  // Awaiting deployment: features with status 'done' but no past deploymentDate
  const awaitingDeploymentCount = projectFeatures.filter(
    (f) => f.status === 'done' && (f.deploymentDate == null || f.deploymentDate > now),
  ).length

  // Upcoming deliveries: features with estimatedEndDate, sorted ascending
  const upcomingDeliveries = projectFeatures
    .filter((f) => f.estimatedEndDate != null)
    .sort((a, b) => a.estimatedEndDate!.getTime() - b.estimatedEndDate!.getTime())

  // Recent diary comments with feature name
  const featureNameMap = Object.fromEntries(projectFeatures.map((f) => [f.id, f.name]))
  const recentComments = recentCommentsRaw.map((c) => ({
    ...c,
    featureName: featureNameMap[c.featureId] ?? 'Feature desconhecida',
  }))

  return {
    project,
    metrics: { totalFeatures, overallProgress, deliveryDate, openImpediments, awaitingDeploymentCount },
    featureProgress,
    teamOccupation,
    upcomingDeliveries,
    upcomingDeployments,
    recentComments,
    blockedFeatures,
  }
}
