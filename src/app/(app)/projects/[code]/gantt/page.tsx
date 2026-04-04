import { redirect } from 'next/navigation'
import { getProjectByCode } from '@/app/actions/projects'
import { getGanttData } from '@/app/actions/gantt'
import { GanttClient } from './gantt-client'

interface GanttPageProps {
  params: Promise<{ code: string }>
}

export default async function GanttPage({ params }: GanttPageProps) {
  const { code } = await params
  const project = await getProjectByCode(code)
  if (!project) redirect('/projects')

  const data = await getGanttData(project.id)

  return <GanttClient projectId={project.id} initialData={data} generatedAt={new Date()} />
}
