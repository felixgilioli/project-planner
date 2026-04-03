'use client'

import { useState, useEffect } from 'react'
import { Plus, Loader2, Users } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { MemberCard } from '@/components/members/member-card'
import { createMember, updateMember } from '@/app/actions/members'
import type { TeamMember } from '@/lib/db/schema'

// ─── Zod schema ───────────────────────────────────────────────────────────────

const memberSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  email: z
    .string()
    .email('Email inválido')
    .optional()
    .or(z.literal('')),
  roleDescription: z.string().optional(),
  dailyCapacityHours: z.number().min(1).max(12),
})

type MemberFormValues = z.infer<typeof memberSchema>

// ─── Main export ──────────────────────────────────────────────────────────────

interface MembersClientProps {
  projectId: string
  initialMembers: TeamMember[]
}

export function MembersClient({ projectId, initialMembers }: MembersClientProps) {
  const [members, setMembers] = useState(initialMembers)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null)

  // Reflect server-side revalidation by syncing with props on navigation
  useEffect(() => {
    setMembers(initialMembers)
  }, [initialMembers])

  function handleEdit(member: TeamMember) {
    setEditingMember(member)
    setDialogOpen(true)
  }

  function handleOpenCreate() {
    setEditingMember(null)
    setDialogOpen(true)
  }

  function handleClose() {
    setDialogOpen(false)
    setEditingMember(null)
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-6 space-y-6">
        <PageHeader title="Membros do time">
          <Button onClick={handleOpenCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Adicionar membro
          </Button>
        </PageHeader>

        {members.length === 0 ? (
          <EmptyState
            title="Nenhum membro"
            description="Adicione membros ao time para atribuir atividades."
            action={
              <Button onClick={handleOpenCreate} variant="outline" className="gap-2">
                <Users className="h-4 w-4" />
                Adicionar primeiro membro
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {members.map((member) => (
              <MemberCard key={member.id} member={member} onEdit={handleEdit} />
            ))}
          </div>
        )}
      </div>

      <MemberDialog
        projectId={projectId}
        open={dialogOpen}
        member={editingMember}
        onClose={handleClose}
      />
    </div>
  )
}

// ─── Member dialog ────────────────────────────────────────────────────────────

interface MemberDialogProps {
  projectId: string
  open: boolean
  member: TeamMember | null
  onClose: () => void
}

function MemberDialog({ projectId, open, member, onClose }: MemberDialogProps) {
  const isEditing = Boolean(member)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<MemberFormValues>({
    resolver: zodResolver(memberSchema),
    defaultValues: {
      name: '',
      email: '',
      roleDescription: '',
      dailyCapacityHours: 8,
    },
  })

  const capacityValue = watch('dailyCapacityHours')

  useEffect(() => {
    if (open) {
      reset({
        name: member?.name ?? '',
        email: member?.email ?? '',
        roleDescription: member?.roleDescription ?? '',
        dailyCapacityHours: member ? parseFloat(member.dailyCapacityHours ?? '8') : 8,
      })
    }
  }, [open, member, reset])

  async function onSubmit(values: MemberFormValues) {
    try {
      const payload = {
        name: values.name,
        email: values.email || undefined,
        roleDescription: values.roleDescription || undefined,
        dailyCapacityHours: values.dailyCapacityHours,
      }

      if (isEditing && member) {
        await updateMember(member.id, payload)
        toast.success('Membro atualizado.')
      } else {
        await createMember(projectId, payload)
        toast.success('Membro adicionado.')
      }

      onClose()
    } catch {
      toast.error(isEditing ? 'Erro ao atualizar membro.' : 'Erro ao adicionar membro.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar membro' : 'Adicionar membro'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="member-name">Nome *</Label>
            <Input
              id="member-name"
              placeholder="Ex: Ana Silva"
              autoFocus
              {...register('name')}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="member-email">Email</Label>
            <Input
              id="member-email"
              type="email"
              placeholder="ana@empresa.com"
              {...register('email')}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          {/* Role */}
          <div className="space-y-2">
            <Label htmlFor="member-role">Cargo / Função</Label>
            <Input
              id="member-role"
              placeholder="ex: Backend Engineer"
              {...register('roleDescription')}
            />
          </div>

          {/* Capacity slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Capacidade diária</Label>
              <span className="text-sm font-medium text-primary">{capacityValue}h por dia</span>
            </div>
            <input
              type="range"
              min={1}
              max={12}
              step={1}
              value={capacityValue}
              onChange={(e) =>
                setValue('dailyCapacityHours', parseInt(e.target.value), {
                  shouldValidate: true,
                })
              }
              className="w-full h-2 accent-primary cursor-pointer"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1h</span>
              <span>12h</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditing ? 'Salvar' : 'Adicionar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
