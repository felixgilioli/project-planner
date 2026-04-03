/**
 * Seed script — creates a tenant and links a user to it.
 *
 * Usage:
 *   SEED_USER_ID=<supabase-auth-uuid> SEED_USER_EMAIL=<email> npm run db:seed
 *
 * Both env vars are required. DATABASE_URL must also be set (via .env.local).
 */

import 'dotenv/config'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { eq } from 'drizzle-orm'
import * as schema from './schema'

const { tenants, users } = schema

async function main() {
  const userId = process.env.SEED_USER_ID
  const userEmail = process.env.SEED_USER_EMAIL

  if (!userId || !userEmail) {
    console.error('❌  SEED_USER_ID and SEED_USER_EMAIL env vars are required.')
    process.exit(1)
  }

  const client = postgres(process.env.DATABASE_URL!, { prepare: false })
  const db = drizzle(client, { schema })

  // Idempotent: skip if user already has a tenant
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (existing) {
    console.log('ℹ️  User already seeded — tenant_id:', existing.tenantId)
    await client.end()
    return
  }

  // Create tenant
  const slug = `tenant-${Date.now()}`
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Minha Empresa', slug })
    .returning()

  // Create user linked to tenant
  await db.insert(users).values({
    id: userId,
    tenantId: tenant.id,
    name: 'Admin',
    email: userEmail,
    role: 'owner',
  })

  console.log('✅  Seed complete!')
  console.log('   Tenant:', tenant.name, '(id:', tenant.id + ')')
  console.log('   User email:', userEmail)

  await client.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
