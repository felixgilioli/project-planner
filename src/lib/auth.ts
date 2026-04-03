'use server'

import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { createClient } from '@/lib/supabase/server'

export async function getAuthenticatedTenantId(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [dbUser] = await db
    .select({ tenantId: users.tenantId })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)

  if (!dbUser) redirect('/login')

  return dbUser.tenantId
}
