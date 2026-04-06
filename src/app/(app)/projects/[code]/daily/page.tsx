import { redirect } from 'next/navigation'
import { getProjectByCode } from '@/app/actions/projects'
import { getDailyData } from '@/app/actions/daily'
import { DailyClient } from './daily-client'

interface DailyPageProps {
  params: Promise<{ code: string }>
}

export default async function DailyPage({ params }: DailyPageProps) {
  const { code } = await params

  const project = await getProjectByCode(code)
  if (!project) redirect('/projects')

  const dailyData = await getDailyData(project.id)

  return <DailyClient project={project} initialData={dailyData} />
}
