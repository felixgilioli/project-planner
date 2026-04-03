import { redirect } from 'next/navigation'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { projects, users } from '@/lib/db/schema'
import { createClient } from '@/lib/supabase/server'
import { ProjectSidebar } from '@/components/projects/project-sidebar'

interface ProjectLayoutProps {
  children: React.ReactNode
  params: Promise<{ id: string }>
}

export default async function ProjectLayout({ children, params }: ProjectLayoutProps) {
  const { id: code } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [dbUser] = await db
    .select({ tenantId: users.tenantId, name: users.name })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)

  if (!dbUser) redirect('/login')

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.code, code), eq(projects.tenantId, dbUser.tenantId)))
    .limit(1)

  if (!project) redirect('/projects')

  return (
    <div className="flex h-screen bg-background">
      <ProjectSidebar project={project} userName={dbUser.name} />
      <main className="flex-1 overflow-auto min-w-0">{children}</main>
    </div>
  )
}
