import { redirect } from 'next/navigation'
import { getProjectByCode } from '@/app/actions/projects'
import { getFeatures } from '@/app/actions/features'
import { getActivities } from '@/app/actions/activities'
import { getMembers } from '@/app/actions/members'
import { FeaturesClient } from './features-client'

interface FeaturesPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ feature?: string }>
}

export default async function FeaturesPage({ params, searchParams }: FeaturesPageProps) {
  const { id: code } = await params
  const { feature: selectedFeatureId } = await searchParams

  const project = await getProjectByCode(code)
  if (!project) redirect('/projects')

  const [features, activities, members] = await Promise.all([
    getFeatures(project.id),
    selectedFeatureId ? getActivities(selectedFeatureId) : Promise.resolve([]),
    getMembers(project.id),
  ])

  return (
    <FeaturesClient
      projectId={project.id}
      projectCode={project.code}
      features={features}
      selectedFeatureId={selectedFeatureId}
      activities={activities}
      members={members}
    />
  )
}
