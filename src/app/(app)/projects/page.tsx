import { Suspense } from 'react'
import { getProjects } from '@/app/actions/projects'
import { ProjectsClient } from './projects-client'

export default async function ProjectsPage() {
  const projects = await getProjects()

  return (
    <div className="container mx-auto px-4 py-8">
      <Suspense>
        <ProjectsClient projects={projects} />
      </Suspense>
    </div>
  )
}
