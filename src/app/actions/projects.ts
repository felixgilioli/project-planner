'use server'

import { revalidatePath } from 'next/cache'
import { eq, and, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { projects } from '@/lib/db/schema'
import { getAuthenticatedTenantId } from '@/lib/auth'
import { projectSchema } from '@/lib/validations/project'

export async function getProjectByCode(code: string) {
  const tenantId = await getAuthenticatedTenantId()

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.code, code), eq(projects.tenantId, tenantId)))
    .limit(1)

  return project ?? null
}

export async function getProjects() {
  const tenantId = await getAuthenticatedTenantId()

  return db
    .select()
    .from(projects)
    .where(eq(projects.tenantId, tenantId))
    .orderBy(projects.createdAt)
}

export async function createProject(data: {
  name: string
  code: string
  description?: string
  color?: string
}) {
  projectSchema.parse(data)
  const tenantId = await getAuthenticatedTenantId()

  const [existing] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.code, data.code), eq(projects.tenantId, tenantId)))
    .limit(1)

  if (existing) throw new Error('Esse código já está em uso.')

  await db.insert(projects).values({
    tenantId,
    name: data.name,
    code: data.code,
    description: data.description ?? null,
    color: data.color ?? '#6366F1',
  })

  revalidatePath('/projects')
}

export async function updateProject(
  id: string,
  data: {
    name?: string
    code?: string
    description?: string
    color?: string
    status?: string
  }
) {
  projectSchema.partial().parse(data)
  const tenantId = await getAuthenticatedTenantId()

  if (data.code) {
    const [existing] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.code, data.code), eq(projects.tenantId, tenantId), ne(projects.id, id)))
      .limit(1)

    if (existing) throw new Error('Esse código já está em uso.')
  }

  await db
    .update(projects)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(and(eq(projects.id, id), eq(projects.tenantId, tenantId)))

  revalidatePath('/projects')
}

export async function deleteProject(id: string) {
  const tenantId = await getAuthenticatedTenantId()

  await db
    .delete(projects)
    .where(and(eq(projects.id, id), eq(projects.tenantId, tenantId)))

  revalidatePath('/projects')
}
