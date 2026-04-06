'use server'

import { revalidatePath } from 'next/cache'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { deploymentSettings, projects } from '@/lib/db/schema'
import { getAuthenticatedTenantId } from '@/lib/auth'

export async function getDeploymentSettings(projectId: string) {
  const tenantId = await getAuthenticatedTenantId()

  const [project] = await db
    .select({ id: projects.id, code: projects.code })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1)

  if (!project) return null

  const [settings] = await db
    .select()
    .from(deploymentSettings)
    .where(eq(deploymentSettings.projectId, projectId))
    .limit(1)

  return settings ?? null
}

export async function saveDeploymentSettings(
  projectId: string,
  blockedWeekdays: string[],
) {
  const tenantId = await getAuthenticatedTenantId()

  const [project] = await db
    .select({ id: projects.id, code: projects.code })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1)

  if (!project) throw new Error('Projeto não encontrado')

  const [existing] = await db
    .select({ id: deploymentSettings.id })
    .from(deploymentSettings)
    .where(eq(deploymentSettings.projectId, projectId))
    .limit(1)

  if (existing) {
    await db
      .update(deploymentSettings)
      .set({ blockedWeekdays, updatedAt: new Date() })
      .where(eq(deploymentSettings.id, existing.id))
  } else {
    await db.insert(deploymentSettings).values({
      tenantId,
      projectId,
      blockedWeekdays,
    })
  }

  revalidatePath(`/projects/${project.code}/settings`)
}
