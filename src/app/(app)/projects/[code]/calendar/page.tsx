import { redirect } from 'next/navigation'
import { getProjectByCode } from '@/app/actions/projects'
import { getCalendar } from '@/app/actions/calendar'
import { getMembers } from '@/app/actions/members'
import { CalendarClient } from './calendar-client'

interface CalendarPageProps {
  params: Promise<{ code: string }>
}

export default async function CalendarPage({ params }: CalendarPageProps) {
  const { code } = await params

  const project = await getProjectByCode(code)
  if (!project) redirect('/projects')

  const year = new Date().getFullYear()
  const [initialData, members] = await Promise.all([
    getCalendar(project.id, year),
    getMembers(project.id),
  ])

  return (
    <CalendarClient
      projectId={project.id}
      initialYear={year}
      initialData={initialData}
      members={members.map((m) => ({ id: m.id, name: m.name }))}
    />
  )
}
