'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { createProject, updateProject } from '@/app/actions/projects'
import type { Project } from '@/lib/db/schema'

const PRESET_COLORS = [
  '#6366F1',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#84CC16',
]

function toProjectCode(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

const formSchema = z.object({
  name: z
    .string()
    .min(1, 'Nome é obrigatório.')
    .max(50, 'Nome pode ter no máximo 50 caracteres.'),
  code: z
    .string()
    .min(1, 'Codigo é obrigatório.')
    .max(30, 'Codigo pode ter no máximo 30 caracteres.')
    .regex(/^[a-z0-9-]+$/, 'Somente letras minusculas, numeros e traco (-).'),
  description: z
    .string()
    .max(200, 'Descrição pode ter no máximo 200 caracteres.')
    .optional(),
  color: z.string(),
})

type FormValues = z.infer<typeof formSchema>

interface ProjectFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pass a project to switch to edit mode */
  project?: Project | null
}

export function ProjectFormDialog({ open, onOpenChange, project }: ProjectFormDialogProps) {
  const isEditing = !!project
  const [isSubmitting, setIsSubmitting] = useState(false)
  const codeManuallyEdited = useRef(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      code: '',
      description: '',
      color: PRESET_COLORS[0],
    },
  })

  // Sync form values when the dialog opens in edit mode
  useEffect(() => {
    if (open) {
      codeManuallyEdited.current = false
      form.reset({
        name: project?.name ?? '',
        code: project?.code ?? '',
        description: project?.description ?? '',
        color: project?.color ?? PRESET_COLORS[0],
      })
    }
  }, [open, project, form])

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true)
    try {
      if (isEditing) {
        await updateProject(project.id, values)
        toast.success('Projeto atualizado!')
      } else {
        await createProject(values)
        toast.success('Projeto criado!')
      }
      onOpenChange(false)
    } catch {
      toast.error('Ocorreu um erro. Tente novamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar projeto' : 'Novo projeto'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Nome do projeto"
                      maxLength={50}
                      {...field}
                      onChange={(e) => {
                        field.onChange(e)
                        if (!codeManuallyEdited.current) {
                          form.setValue('code', toProjectCode(e.target.value), {
                            shouldValidate: true,
                          })
                        }
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Codigo *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="ex: finan-veic"
                      maxLength={30}
                      {...field}
                      onChange={(e) => {
                        codeManuallyEdited.current = true
                        field.onChange(e.target.value.toLowerCase())
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Descrição opcional"
                      maxLength={200}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cor</FormLabel>
                  <FormControl>
                    <div className="flex flex-wrap gap-2">
                      {PRESET_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={cn(
                            'h-8 w-8 rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                            field.value === color && 'ring-2 ring-ring ring-offset-2 scale-110'
                          )}
                          style={{ backgroundColor: color }}
                          onClick={() => field.onChange(color)}
                          aria-label={color}
                        />
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Salvando…' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
