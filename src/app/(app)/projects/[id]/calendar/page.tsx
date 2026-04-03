import { redirect } from 'next/navigation'
import { getProjectByCode } from '@/app/actions/projects'
import { getCalendar } from '@/app/actions/calendar'
import { CalendarClient } from './calendar-client'

interface CalendarPageProps {
  params: Promise<{ id: string }>
}

export default async function CalendarPage({ params }: CalendarPageProps) {
  const { id: code } = await params

  const project = await getProjectByCode(code)
  if (!project) redirect('/projects')

  const year = new Date().getFullYear()
  const initialData = await getCalendar(project.id, year)

  return (
    <CalendarClient
      projectId={project.id}
      initialYear={year}
      initialData={initialData}
    />
  )
}
