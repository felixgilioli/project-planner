'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Pencil, Archive, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { updateProject, deleteProject } from '@/app/actions/projects'
import type { Project } from '@/lib/db/schema'

interface ProjectCardProps {
  project: Project
  onEdit: (project: Project) => void
}

export function ProjectCard({ project, onEdit }: ProjectCardProps) {
  const router = useRouter()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const isArchived = project.status === 'archived'

  async function handleArchive() {
    setIsArchiving(true)
    try {
      await updateProject(project.id, {
        status: isArchived ? 'active' : 'archived',
      })
      toast.success(isArchived ? 'Projeto reativado.' : 'Projeto arquivado.')
    } catch {
      toast.error('Erro ao atualizar projeto.')
    } finally {
      setIsArchiving(false)
    }
  }

  async function handleDelete() {
    setIsDeleting(true)
    try {
      await deleteProject(project.id)
      toast.success('Projeto excluído.')
    } catch {
      toast.error('Erro ao excluir projeto.')
    } finally {
      setIsDeleting(false)
      setDeleteOpen(false)
    }
  }

  return (
    <>
      <Card
        className="group relative overflow-hidden cursor-pointer transition-shadow hover:shadow-md"
        onClick={() => router.push(`/projects/${project.code}/features`)}
      >
        {/* Color strip */}
        <div className="h-2 w-full" style={{ backgroundColor: project.color }} />

        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold leading-tight line-clamp-1">{project.name}</h3>
              {project.code && (
                <span className="text-xs text-muted-foreground font-mono">{project.code}</span>
              )}
            </div>

            {/* Actions menu — stop click from navigating to the project */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Ações</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem
                  onSelect={() => onEdit(project)}
                  className="gap-2"
                >
                  <Pencil className="h-4 w-4" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={handleArchive}
                  disabled={isArchiving}
                  className="gap-2"
                >
                  <Archive className="h-4 w-4" />
                  {isArchived ? 'Reativar' : 'Arquivar'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => setDeleteOpen(true)}
                  className="gap-2 text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {project.description && (
            <p className="mt-1.5 text-sm text-muted-foreground line-clamp-2">
              {project.description}
            </p>
          )}

          <div className="mt-3">
            <Badge variant={isArchived ? 'secondary' : 'success'}>
              {isArchived ? 'Arquivado' : 'Ativo'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir projeto</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{project.name}</strong>? Esta ação não pode
              ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Excluindo…' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
