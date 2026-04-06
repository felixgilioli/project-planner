'use server'

import { eq, and, inArray, desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { projects, features, activities, teamMembers, featureComments } from '@/lib/db/schema'
import { getAuthenticatedTenantId } from '@/lib/auth'

const OCCUPATION_REFERENCE_DAYS = 20 // 4-week window for utilization calc

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

  const [projectActivities, recentCommentsRaw, openImpedimentsRaw] = await Promise.all([
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
    featureIds.length > 0
      ? db
          .select({ id: featureComments.id })
          .from(featureComments)
          .where(
            and(
              eq(featureComments.tenantId, tenantId),
              inArray(featureComments.featureId, featureIds),
              eq(featureComments.type, 'impediment'),
            ),
          )
      : Promise.resolve([]),
  ])

  // Metrics
  const totalFeatures = projectFeatures.length
  const totalActivities = projectActivities.length
  const doneActivities = projectActivities.filter((a) => a.status === 'done').length
  const overallProgress =
    totalActivities > 0 ? Math.round((doneActivities / totalActivities) * 100) : 0

  const deliveryDate = projectFeatures
    .map((f) => f.estimatedEndDate)
    .filter((d): d is Date => d != null)
    .reduce<Date | null>((max, d) => (!max || d > max ? d : max), null)

  const openImpediments = openImpedimentsRaw.length

  // Feature progress
  const featureProgress = projectFeatures.map((feature) => {
    const acts = projectActivities.filter((a) => a.featureId === feature.id)
    const done = acts.filter((a) => a.status === 'done').length
    return {
      feature,
      totalActivities: acts.length,
      doneActivities: done,
      progressPercent: acts.length > 0 ? Math.round((done / acts.length) * 100) : 0,
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
    return { member, assignedHours, utilizationPercent }
  })

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
    metrics: { totalFeatures, overallProgress, deliveryDate, openImpediments },
    featureProgress,
    teamOccupation,
    upcomingDeliveries,
    recentComments,
  }
}
