'use server'

import { revalidatePath } from 'next/cache'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { featureComments, features } from '@/lib/db/schema'
import { getAuthenticatedTenantId } from '@/lib/auth'

export async function getComments(featureId: string) {
  const tenantId = await getAuthenticatedTenantId()

  return db
    .select()
    .from(featureComments)
    .where(
      and(
        eq(featureComments.featureId, featureId),
        eq(featureComments.tenantId, tenantId),
      ),
    )
    .orderBy(desc(featureComments.createdAt))
}

export async function createComment(
  featureId: string,
  data: { content: string; type: string },
) {
  if (!data.content.trim()) throw new Error('Conteúdo é obrigatório')
  if (data.content.length > 1000) throw new Error('Conteúdo muito longo')

  const tenantId = await getAuthenticatedTenantId()

  const [feature] = await db
    .select({ id: features.id, projectId: features.projectId })
    .from(features)
    .where(and(eq(features.id, featureId), eq(features.tenantId, tenantId)))
    .limit(1)

  if (!feature) throw new Error('Feature não encontrada')

  await db.insert(featureComments).values({
    tenantId,
    featureId,
    content: data.content.trim(),
    type: data.type,
  })

  revalidatePath(`/projects`)
}

export async function deleteComment(id: string) {
  const tenantId = await getAuthenticatedTenantId()

  await db
    .delete(featureComments)
    .where(and(eq(featureComments.id, id), eq(featureComments.tenantId, tenantId)))

  revalidatePath(`/projects`)
}
