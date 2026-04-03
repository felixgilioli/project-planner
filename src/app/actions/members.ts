'use server'

import { revalidatePath } from 'next/cache'
import { eq, and, asc, isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { teamMembers, projects, activities } from '@/lib/db/schema'
import { getAuthenticatedTenantId } from '@/lib/auth'
import { calcEstimatedEndDate } from '@/lib/utils'

export async function getMembers(projectId: string) {
  const tenantId = await getAuthenticatedTenantId()

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1)

  if (!project) return []

  return db
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
}

export async function createMember(
  projectId: string,
  data: {
    name: string
    email?: string
    roleDescription?: string
    dailyCapacityHours?: number
  },
) {
  const tenantId = await getAuthenticatedTenantId()

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1)

  if (!project) throw new Error('Projeto não encontrado')

  await db.insert(teamMembers).values({
    tenantId,
    projectId,
    name: data.name,
    email: data.email ?? null,
    roleDescription: data.roleDescription ?? null,
    dailyCapacityHours: String(data.dailyCapacityHours ?? 8),
  })

  revalidatePath(`/projects/${projectId}/members`)
}

export async function updateMember(
  id: string,
  data: {
    name?: string
    email?: string | null
    roleDescription?: string | null
    dailyCapacityHours?: number
  },
) {
  const tenantId = await getAuthenticatedTenantId()

  const [member] = await db
    .select({ projectId: teamMembers.projectId })
    .from(teamMembers)
    .where(and(eq(teamMembers.id, id), eq(teamMembers.tenantId, tenantId)))
    .limit(1)

  if (!member) throw new Error('Membro não encontrado')

  const { dailyCapacityHours, ...rest } = data
  await db
    .update(teamMembers)
    .set({
      ...rest,
      ...(dailyCapacityHours !== undefined
        ? { dailyCapacityHours: String(dailyCapacityHours) }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(teamMembers.id, id), eq(teamMembers.tenantId, tenantId)))

  if (dailyCapacityHours !== undefined) {
    const assigned = await db
      .select({
        id: activities.id,
        startDate: activities.startDate,
        estimatedHours: activities.estimatedHours,
      })
      .from(activities)
      .where(
        and(
          eq(activities.assignedMemberId, id),
          eq(activities.tenantId, tenantId),
          isNotNull(activities.startDate),
        ),
      )

    await Promise.all(
      assigned.map((activity) => {
        const estimatedEndDate = calcEstimatedEndDate(
          activity.startDate!,
          parseFloat(activity.estimatedHours ?? '0'),
          dailyCapacityHours,
        )
        return db
          .update(activities)
          .set({ estimatedEndDate, updatedAt: new Date() })
          .where(eq(activities.id, activity.id))
      }),
    )
  }

  revalidatePath(`/projects/${member.projectId}/members`)
}

export async function deleteMember(id: string) {
  const tenantId = await getAuthenticatedTenantId()

  const [member] = await db
    .select({ projectId: teamMembers.projectId })
    .from(teamMembers)
    .where(and(eq(teamMembers.id, id), eq(teamMembers.tenantId, tenantId)))
    .limit(1)

  if (!member) throw new Error('Membro não encontrado')

  await db
    .update(teamMembers)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(teamMembers.id, id), eq(teamMembers.tenantId, tenantId)))

  revalidatePath(`/projects/${member.projectId}/members`)
}
