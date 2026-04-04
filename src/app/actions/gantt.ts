'use server'

import { eq, and, asc, isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { features, activities, teamMembers, projects } from '@/lib/db/schema'
import { getAuthenticatedTenantId } from '@/lib/auth'

function getISOWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`
}

export async function getGanttData(projectId: string) {
  const tenantId = await getAuthenticatedTenantId()

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1)

  if (!project) return { items: [], memberAllocations: [] }

  const featureRows = await db
    .select({
      id: features.id,
      name: features.name,
      priority: features.priority,
      status: features.status,
      displayOrder: features.displayOrder,
    })
    .from(features)
    .where(and(eq(features.projectId, projectId), eq(features.tenantId, tenantId)))
    .orderBy(asc(features.displayOrder), asc(features.createdAt))

  const activityRows = await db
    .select({
      id: activities.id,
      featureId: activities.featureId,
      name: activities.name,
      status: activities.status,
      estimatedHours: activities.estimatedHours,
      startDate: activities.startDate,
      estimatedEndDate: activities.estimatedEndDate,
      assignedMemberId: activities.assignedMemberId,
      memberName: teamMembers.name,
    })
    .from(activities)
    .leftJoin(teamMembers, eq(activities.assignedMemberId, teamMembers.id))
    .where(
      and(
        eq(activities.tenantId, tenantId),
        isNotNull(activities.startDate),
        isNotNull(activities.estimatedEndDate),
      ),
    )
    .orderBy(asc(activities.displayOrder), asc(activities.createdAt))

  const activitiesByFeature = new Map<string, typeof activityRows>()
  for (const act of activityRows) {
    const list = activitiesByFeature.get(act.featureId) ?? []
    list.push(act)
    activitiesByFeature.set(act.featureId, list)
  }

  const items = featureRows
    .map((f) => ({
      feature: f,
      activities: activitiesByFeature.get(f.id) ?? [],
    }))
    .filter((item) => item.activities.length > 0)

  const memberRows = await db
    .select({
      id: teamMembers.id,
      name: teamMembers.name,
      dailyCapacityHours: teamMembers.dailyCapacityHours,
    })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.projectId, projectId),
        eq(teamMembers.tenantId, tenantId),
        eq(teamMembers.isActive, true),
      ),
    )

  const memberAllocations = memberRows.map((member) => {
    const memberActivities = activityRows.filter((a) => a.assignedMemberId === member.id)
    const weeklyHours: Record<string, number> = {}
    for (const act of memberActivities) {
      if (!act.startDate) continue
      const weekKey = getISOWeekKey(new Date(act.startDate))
      weeklyHours[weekKey] = (weeklyHours[weekKey] ?? 0) + Number(act.estimatedHours)
    }
    return {
      member: {
        id: member.id,
        name: member.name,
        dailyCapacityHours: Number(member.dailyCapacityHours),
      },
      weeklyHours,
    }
  })

  return { items, memberAllocations }
}

export type GanttData = Awaited<ReturnType<typeof getGanttData>>
export type GanttItem = GanttData['items'][number]
export type MemberAllocation = GanttData['memberAllocations'][number]
