import { redirect } from 'next/navigation'
import { getProjectByCode } from '@/app/actions/projects'
import { getMembers } from '@/app/actions/members'
import { MembersClient } from './members-client'

interface MembersPageProps {
  params: Promise<{ code: string }>
}

export default async function MembersPage({ params }: MembersPageProps) {
  const { code } = await params

  const project = await getProjectByCode(code)
  if (!project) redirect('/projects')

  const members = await getMembers(project.id)

  return <MembersClient projectId={project.id} initialMembers={members} />
}
