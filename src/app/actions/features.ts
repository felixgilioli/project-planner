'use server'

import { revalidatePath } from 'next/cache'
import { eq, and, asc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { features, projects } from '@/lib/db/schema'
import { getAuthenticatedTenantId } from '@/lib/auth'

export async function getFeatures(projectId: string) {
  const tenantId = await getAuthenticatedTenantId()

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1)

  if (!project) return []

  return db
    .select()
    .from(features)
    .where(and(eq(features.projectId, projectId), eq(features.tenantId, tenantId)))
    .orderBy(asc(features.displayOrder), asc(features.createdAt))
}

export async function createFeature(
  projectId: string,
  data: { name: string; description?: string; priority?: string; status?: string }
) {
  const tenantId = await getAuthenticatedTenantId()

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1)

  if (!project) throw new Error('Projeto não encontrado')

  await db.insert(features).values({
    tenantId,
    projectId,
    name: data.name,
    description: data.description ?? null,
    priority: data.priority ?? 'medium',
    status: data.status ?? 'backlog',
  })

  revalidatePath(`/projects/${projectId}/features`)
}

export async function updateFeature(
  id: string,
  data: {
    name?: string
    description?: string
    priority?: string
    status?: string
    displayOrder?: number
  }
) {
  const tenantId = await getAuthenticatedTenantId()

  const [feature] = await db
    .select({ projectId: features.projectId })
    .from(features)
    .where(and(eq(features.id, id), eq(features.tenantId, tenantId)))
    .limit(1)

  if (!feature) throw new Error('Feature não encontrada')

  await db
    .update(features)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(features.id, id), eq(features.tenantId, tenantId)))

  revalidatePath(`/projects/${feature.projectId}/features`)
}

export async function deleteFeature(id: string) {
  const tenantId = await getAuthenticatedTenantId()

  const [feature] = await db
    .select({ projectId: features.projectId })
    .from(features)
    .where(and(eq(features.id, id), eq(features.tenantId, tenantId)))
    .limit(1)

  if (!feature) throw new Error('Feature não encontrada')

  await db
    .delete(features)
    .where(and(eq(features.id, id), eq(features.tenantId, tenantId)))

  revalidatePath(`/projects/${feature.projectId}/features`)
}
