'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { ProjectCard } from '@/components/projects/project-card'
import { ProjectFormDialog } from '@/components/projects/project-form-dialog'
import type { Project } from '@/lib/db/schema'

interface ProjectsClientProps {
  projects: Project[]
}

export function ProjectsClient({ projects }: ProjectsClientProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)

  function handleNewProject() {
    setEditingProject(null)
    setDialogOpen(true)
  }

  function handleEditProject(project: Project) {
    setEditingProject(project)
    setDialogOpen(true)
  }

  return (
    <>
      <PageHeader
        title="Meus projetos"
        description="Gerencie os projetos do seu time"
      >
        <Button onClick={handleNewProject}>
          <Plus className="mr-2 h-4 w-4" />
          Novo projeto
        </Button>
      </PageHeader>

      <div className="mt-8">
        {projects.length === 0 ? (
          <EmptyState
            title="Nenhum projeto ainda"
            description="Crie seu primeiro projeto para começar a planejar."
            action={
              <Button onClick={handleNewProject}>
                <Plus className="mr-2 h-4 w-4" />
                Novo projeto
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onEdit={handleEditProject}
              />
            ))}
          </div>
        )}
      </div>

      <ProjectFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        project={editingProject}
      />
    </>
  )
}
