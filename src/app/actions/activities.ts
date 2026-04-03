'use server'

import { revalidatePath } from 'next/cache'
import { eq, and, asc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { activities, features, teamMembers } from '@/lib/db/schema'
import { getAuthenticatedTenantId } from '@/lib/auth'
import { calcEstimatedEndDate } from '@/lib/utils'

async function resolveEstimatedEndDate(
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
  return calcEstimatedEndDate(startDate, estimatedHours, parseFloat(member.dailyCapacityHours))
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
  const tenantId = await getAuthenticatedTenantId()

  const [feature] = await db
    .select({ projectId: features.projectId })
    .from(features)
    .where(and(eq(features.id, featureId), eq(features.tenantId, tenantId)))
    .limit(1)

  if (!feature) throw new Error('Feature não encontrada')

  const estimatedEndDate = await resolveEstimatedEndDate(
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

  revalidatePath(`/projects/${activity.projectId}/features`)
}
