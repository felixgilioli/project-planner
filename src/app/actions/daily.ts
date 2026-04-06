'use server'

import { and, eq, asc, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { activities, features, teamMembers } from '@/lib/db/schema'
import { getAuthenticatedTenantId } from '@/lib/auth'
import type { Activity, TeamMember } from '@/lib/db/schema'

export type ActivityWithFeature = Activity & { featureName: string }

export type MemberWithActivities = {
  member: TeamMember
  activities: ActivityWithFeature[]
}

export async function getDailyData(projectId: string): Promise<MemberWithActivities[]> {
  const tenantId = await getAuthenticatedTenantId()

  const members = await db
    .select()
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.projectId, projectId),
        eq(teamMembers.tenantId, tenantId),
        eq(teamMembers.isActive, true),
      ),
    )
    .orderBy(asc(teamMembers.name))

  if (members.length === 0) return []

  const memberIds = members.map((m) => m.id)

  const rows = await db
    .select({
      id: activities.id,
      tenantId: activities.tenantId,
      featureId: activities.featureId,
      name: activities.name,
      startDate: activities.startDate,
      dependsOnId: activities.dependsOnId,
      estimatedHours: activities.estimatedHours,
      assignedMemberId: activities.assignedMemberId,
      estimatedEndDate: activities.estimatedEndDate,
      status: activities.status,
      progress: activities.progress,
      displayOrder: activities.displayOrder,
      createdAt: activities.createdAt,
      updatedAt: activities.updatedAt,
      featureName: features.name,
    })
    .from(activities)
    .innerJoin(features, eq(activities.featureId, features.id))
    .where(
      and(
        eq(activities.tenantId, tenantId),
        inArray(activities.assignedMemberId, memberIds),
      ),
    )
    // PostgreSQL ASC puts NULLs last by default
    .orderBy(asc(activities.estimatedEndDate))

  const byMember = new Map<string, ActivityWithFeature[]>()
  for (const row of rows) {
    const list = byMember.get(row.assignedMemberId!) ?? []
    list.push(row as ActivityWithFeature)
    byMember.set(row.assignedMemberId!, list)
  }

  return members.map((member) => ({
    member,
    activities: byMember.get(member.id) ?? [],
  }))
}
