import { redirect } from 'next/navigation'

interface ProjectRootPageProps {
  params: Promise<{ code: string }>
}

export default async function ProjectRootPage({ params }: ProjectRootPageProps) {
  const { code } = await params
  redirect(`/projects/${code}/overview`)
}
