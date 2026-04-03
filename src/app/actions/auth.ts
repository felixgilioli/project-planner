'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { tenants, users } from '@/lib/db/schema'

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

export async function loginUser(
  _prevState: { error: string } | null,
  formData: FormData,
) {
  const email = (formData.get('email') as string)?.trim()
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Preencha todos os campos.' }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: 'E-mail ou senha inválidos.' }
  }

  redirect('/projects')
}

export async function registerUser(
  _prevState: { error: string } | null,
  formData: FormData,
) {
  const name = (formData.get('name') as string)?.trim()
  const orgName = (formData.get('org') as string)?.trim()
  const email = (formData.get('email') as string)?.trim()
  const password = formData.get('password') as string

  if (!name || !orgName || !email || !password) {
    return { error: 'Preencha todos os campos.' }
  }

  if (password.length < 6) {
    return { error: 'A senha deve ter pelo menos 6 caracteres.' }
  }

  const supabase = await createClient()

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  })

  if (authError || !authData.user) {
    return { error: authError?.message ?? 'Erro ao criar usuário.' }
  }

  const userId = authData.user.id

  try {
    // Append random suffix to avoid slug collisions
    const baseSlug = toSlug(orgName)
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`

    const [tenant] = await db.insert(tenants).values({ name: orgName, slug }).returning()

    await db.insert(users).values({
      id: userId,
      tenantId: tenant.id,
      name,
      email,
      role: 'owner',
    })
  } catch {
    // Clean up Supabase auth user if DB insert fails
    await supabase.auth.admin.deleteUser(userId).catch(() => null)
    return { error: 'Erro ao salvar os dados. Tente novamente.' }
  }

  redirect('/login?registered=true')
}
