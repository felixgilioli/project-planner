'use client'

import { useState, useRef, useEffect, useMemo, memo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, X, Check, Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { createFeature, updateFeature, deleteFeature } from '@/app/actions/features'
import { createActivity, updateActivity, deleteActivity } from '@/app/actions/activities'
import { MemberAvatar } from '@/components/members/member-card'
import type { Feature, Activity, TeamMember } from '@/lib/db/schema'

// ─── Config maps ────────────────────────────────────────────────────────────

const PRIORITY_CONFIG = {
  critical: { label: 'Crítica', className: 'bg-red-100 text-red-800 border-0' },
  high: { label: 'Alta', className: 'bg-amber-100 text-amber-800 border-0' },
  medium: { label: 'Média', className: 'bg-blue-100 text-blue-800 border-0' },
  low: { label: 'Baixa', className: 'bg-gray-100 text-gray-600 border-0' },
} as const

const STATUS_CONFIG = {
  backlog: { label: 'Backlog', className: 'bg-gray-100 text-gray-600 border-0' },
  in_progress: { label: 'Em progresso', className: 'bg-blue-100 text-blue-800 border-0' },
  done: { label: 'Concluída', className: 'bg-emerald-100 text-emerald-800 border-0' },
  blocked: { label: 'Bloqueada', className: 'bg-red-100 text-red-800 border-0' },
} as const

function priorityConfig(p: string) {
  return PRIORITY_CONFIG[p as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.medium
}
function statusConfig(s: string) {
  return STATUS_CONFIG[s as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.backlog
}

// ─── Main export ─────────────────────────────────────────────────────────────

interface FeaturesClientProps {
  projectId: string
  projectCode: string
  features: Feature[]
  selectedFeatureId?: string
  activities: Activity[]
  members: TeamMember[]
}

export function FeaturesClient({
  projectId,
  projectCode,
  features,
  selectedFeatureId,
  activities,
  members,
}: FeaturesClientProps) {
  const router = useRouter()
  const selectedFeature = features.find((f) => f.id === selectedFeatureId) ?? null
  const [createOpen, setCreateOpen] = useState(false)

  function selectFeature(id: string) {
    router.push(`/projects/${projectCode}/features?feature=${id}`)
  }

  return (
    <div className="flex h-full">
      {/* ── Left: feature list ─────────────────────────────────────────── */}
      <div className="w-72 border-r flex flex-col shrink-0">
        <div className="p-4 border-b flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            {features.length} {features.length === 1 ? 'feature' : 'features'}
          </span>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {features.length === 0 ? (
            <EmptyState
              title="Nenhuma feature"
              description='Clique em "+" para criar a primeira feature.'
            />
          ) : (
            <div className="space-y-1">
              {features.map((feature) => (
                <FeatureListItem
                  key={feature.id}
                  feature={feature}
                  isSelected={feature.id === selectedFeatureId}
                  onClick={() => selectFeature(feature.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: feature detail ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {selectedFeature ? (
          <FeatureDetail
            feature={selectedFeature}
            activities={activities}
            projectId={projectId}
            projectCode={projectCode}
            members={members}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center h-full">
            <EmptyState
              title="Selecione uma feature"
              description="Escolha uma feature na lista para ver os detalhes."
            />
          </div>
        )}
      </div>

      <CreateFeatureDialog
        projectId={projectId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  )
}

// ─── Feature list item ────────────────────────────────────────────────────────

const FeatureListItem = memo(function FeatureListItem({
  feature,
  isSelected,
  onClick,
}: {
  feature: Feature
  isSelected: boolean
  onClick: () => void
}) {
  const pCfg = priorityConfig(feature.priority)
  const sCfg = statusConfig(feature.status)

  return (
    <div
      onClick={onClick}
      className={cn(
        'p-3 rounded-md cursor-pointer transition-colors border',
        isSelected
          ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-800'
          : 'border-transparent hover:bg-muted'
      )}
    >
      <p className="text-sm font-medium line-clamp-2 mb-2">{feature.name}</p>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge className={cn('text-xs', pCfg.className)}>{pCfg.label}</Badge>
        <Badge className={cn('text-xs', sCfg.className)}>{sCfg.label}</Badge>
      </div>
      <div className="mt-2 h-1 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full bg-indigo-500 rounded-full" style={{ width: '0%' }} />
      </div>
    </div>
  )
})

// ─── Feature detail panel ─────────────────────────────────────────────────────

function FeatureDetail({
  feature,
  activities,
  projectId,
  projectCode,
  members,
}: {
  feature: Feature
  activities: Activity[]
  projectId: string
  projectCode: string
  members: TeamMember[]
}) {
  const router = useRouter()
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Pre-compute lookup maps to avoid O(n) find() inside render loops
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const activitiesById = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities])


  const [editingName, setEditingName] = useState(false)
  const [editingField, setEditingField] = useState<'status' | 'priority' | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [activityModalOpen, setActivityModalOpen] = useState(false)
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)

  const [isSavingName, setIsSavingName] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [isUpdatingPriority, setIsUpdatingPriority] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deletingActivityId, setDeletingActivityId] = useState<string | null>(null)

  // Reset editing state when the selected feature changes
  useEffect(() => {
    setEditingName(false)
    setEditingField(null)
    setActivityModalOpen(false)
    setEditingActivity(null)
  }, [feature.id])

  async function handleSaveName() {
    const name = nameInputRef.current?.value.trim()
    if (!name || name === feature.name) {
      setEditingName(false)
      return
    }
    setIsSavingName(true)
    try {
      await updateFeature(feature.id, { name })
      toast.success('Feature atualizada.')
    } catch {
      toast.error('Erro ao atualizar feature.')
    } finally {
      setIsSavingName(false)
      setEditingName(false)
    }
  }

  async function handleUpdateStatus(status: string) {
    setEditingField(null)
    setIsUpdatingStatus(true)
    try {
      await updateFeature(feature.id, { status })
      toast.success('Status atualizado.')
    } catch {
      toast.error('Erro ao atualizar status.')
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  async function handleUpdatePriority(priority: string) {
    setEditingField(null)
    setIsUpdatingPriority(true)
    try {
      await updateFeature(feature.id, { priority })
      toast.success('Prioridade atualizada.')
    } catch {
      toast.error('Erro ao atualizar prioridade.')
    } finally {
      setIsUpdatingPriority(false)
    }
  }

  async function handleDeleteFeature() {
    setIsDeleting(true)
    try {
      await deleteFeature(feature.id)
      toast.success('Feature excluída.')
      router.push(`/projects/${projectCode}/features`)
    } catch {
      toast.error('Erro ao excluir feature.')
    } finally {
      setIsDeleting(false)
      setDeleteOpen(false)
    }
  }

  async function handleDeleteActivity(activityId: string) {
    setDeletingActivityId(activityId)
    try {
      await deleteActivity(activityId)
      toast.success('Atividade removida.')
    } catch {
      toast.error('Erro ao remover atividade.')
    } finally {
      setDeletingActivityId(null)
    }
  }

  const pCfg = priorityConfig(feature.priority)
  const sCfg = statusConfig(feature.status)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b">
        {/* Name row */}
        <div className="flex items-start gap-2 mb-3">
          {editingName ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                ref={nameInputRef}
                defaultValue={feature.name}
                className="flex-1 text-xl font-semibold bg-transparent border-b border-border focus:outline-none focus:border-primary"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName()
                  if (e.key === 'Escape') setEditingName(false)
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={handleSaveName}
                disabled={isSavingName}
              >
                {isSavingName ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={() => setEditingName(false)}
                disabled={isSavingName}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <h2
              className="text-xl font-semibold flex-1 cursor-pointer hover:text-primary transition-colors"
              onClick={() => setEditingName(true)}
              title="Clique para editar"
            >
              {feature.name}
            </h2>
          )}

          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Status & Priority */}
        <div className="flex items-center gap-2 flex-wrap">
          {editingField === 'status' ? (
            <select
              autoFocus
              defaultValue={feature.status}
              className="text-xs border rounded-full px-2.5 py-0.5 bg-background focus:outline-none"
              onChange={(e) => handleUpdateStatus(e.target.value)}
              onBlur={() => setEditingField(null)}
            >
              {Object.entries(STATUS_CONFIG).map(([value, cfg]) => (
                <option key={value} value={value}>{cfg.label}</option>
              ))}
            </select>
          ) : (
            <Badge
              className={cn('cursor-pointer', sCfg.className)}
              onClick={() => setEditingField('status')}
              title="Clique para editar"
            >
              {isUpdatingStatus ? <Loader2 className="h-3 w-3 animate-spin" /> : sCfg.label}
            </Badge>
          )}

          {editingField === 'priority' ? (
            <select
              autoFocus
              defaultValue={feature.priority}
              className="text-xs border rounded-full px-2.5 py-0.5 bg-background focus:outline-none"
              onChange={(e) => handleUpdatePriority(e.target.value)}
              onBlur={() => setEditingField(null)}
            >
              {Object.entries(PRIORITY_CONFIG).map(([value, cfg]) => (
                <option key={value} value={value}>{cfg.label}</option>
              ))}
            </select>
          ) : (
            <Badge
              className={cn('cursor-pointer', pCfg.className)}
              onClick={() => setEditingField('priority')}
              title="Clique para editar"
            >
              {isUpdatingPriority ? <Loader2 className="h-3 w-3 animate-spin" /> : pCfg.label}
            </Badge>
          )}
        </div>
      </div>

      {/* Activities section */}
      <div className="flex-1 overflow-y-auto p-6">
        <h3 className="font-semibold mb-4">Atividades</h3>

        {activities.length === 0 && (
          <p className="text-sm text-muted-foreground mb-4">Nenhuma atividade ainda.</p>
        )}

        {activities.length > 0 && (
          <div className="space-y-1 mb-4">
            {activities.map((activity) => {
              const asCfg = statusConfig(activity.status)
              const isRemovingThis = deletingActivityId === activity.id
              const dependsOn = activity.dependsOnId ? activitiesById.get(activity.dependsOnId) : null
              const assignedMember = activity.assignedMemberId ? membersById.get(activity.assignedMemberId) : null

              return (
                <div
                  key={activity.id}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-muted group"
                >
                  <span className="text-sm flex-1 truncate">{activity.name}</span>
                  {dependsOn && (
                    <span className="text-xs text-muted-foreground shrink-0" title={`Depende de: ${dependsOn.name}`}>
                      ↳ {dependsOn.name}
                    </span>
                  )}
                  {activity.startDate && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(activity.startDate).toLocaleDateString('pt-BR')}
                      {activity.estimatedEndDate && (
                        <> → {new Date(activity.estimatedEndDate).toLocaleDateString('pt-BR')}</>
                      )}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                    {parseFloat(activity.estimatedHours ?? '0')}h
                  </span>
                  {assignedMember && (
                    <span title={assignedMember.name} className="shrink-0">
                      <MemberAvatar name={assignedMember.name} size="sm" />
                    </span>
                  )}
                  <Badge className={cn('text-xs shrink-0', asCfg.className)}>{asCfg.label}</Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity"
                    onClick={() => { setEditingActivity(activity); setActivityModalOpen(true) }}
                    disabled={isRemovingThis}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity"
                    onClick={() => handleDeleteActivity(activity.id)}
                    disabled={isRemovingThis}
                  >
                    {isRemovingThis ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              )
            })}
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground hover:text-foreground"
          onClick={() => { setEditingActivity(null); setActivityModalOpen(true) }}
        >
          <Plus className="h-4 w-4" />
          Adicionar atividade
        </Button>

        <ActivityFormDialog
          open={activityModalOpen}
          onOpenChange={(open) => { setActivityModalOpen(open); if (!open) setEditingActivity(null) }}
          featureId={feature.id}
          existingActivities={activities}
          members={members}
          activity={editingActivity}
        />
      </div>

      {/* Delete feature dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir feature</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{feature.name}</strong>? Todas as atividades
              serão excluídas também. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteFeature}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Excluindo…' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Activity form dialog (create & edit) ────────────────────────────────────

function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toISOString().slice(0, 10)
}

function ActivityFormDialog({
  open,
  onOpenChange,
  featureId,
  existingActivities,
  members,
  activity,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  featureId: string
  existingActivities: Activity[]
  members: TeamMember[]
  activity: Activity | null
}) {
  const isEditing = activity !== null

  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [dependsOnId, setDependsOnId] = useState('')
  const [hours, setHours] = useState('')
  const [assignedMemberId, setAssignedMemberId] = useState('')
  const [status, setStatus] = useState('backlog')
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    if (open) {
      setName(activity?.name ?? '')
      setStartDate(toDateInputValue(activity?.startDate))
      setDependsOnId(activity?.dependsOnId ?? '')
      setHours(activity?.estimatedHours ? String(parseFloat(activity.estimatedHours)) : '')
      setAssignedMemberId(activity?.assignedMemberId ?? '')
      setStatus(activity?.status ?? 'backlog')
    }
  }, [open, activity])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setIsPending(true)
    try {
      if (isEditing) {
        await updateActivity(activity.id, {
          name: name.trim(),
          startDate: startDate ? new Date(startDate) : null,
          dependsOnId: dependsOnId || null,
          estimatedHours: hours ? parseFloat(hours) : 0,
          assignedMemberId: assignedMemberId || null,
          status,
        })
        toast.success('Atividade atualizada.')
      } else {
        await createActivity(featureId, {
          name: name.trim(),
          startDate: startDate ? new Date(startDate) : null,
          dependsOnId: dependsOnId || null,
          estimatedHours: hours ? parseFloat(hours) : 0,
          assignedMemberId: assignedMemberId || null,
        })
        toast.success('Atividade criada.')
      }
      onOpenChange(false)
    } catch {
      toast.error(isEditing ? 'Erro ao atualizar atividade.' : 'Erro ao criar atividade.')
    } finally {
      setIsPending(false)
    }
  }

  // Exclude the activity being edited from the dependency options
  const dependencyOptions = existingActivities.filter((a) => a.id !== activity?.id)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar atividade' : 'Nova atividade'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="activity-name">Nome *</Label>
            <Input
              id="activity-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome da atividade"
              autoFocus
            />
          </div>

          {isEditing && (
            <div className="space-y-2">
              <Label htmlFor="activity-status">Status</Label>
              <select
                id="activity-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {Object.entries(STATUS_CONFIG).map(([value, cfg]) => (
                  <option key={value} value={value}>{cfg.label}</option>
                ))}
              </select>
            </div>
          )}

          {dependencyOptions.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="activity-depends">Dependência</Label>
              <select
                id="activity-depends"
                value={dependsOnId}
                onChange={(e) => setDependsOnId(e.target.value)}
                className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Sem dependência</option>
                {dependencyOptions.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          {members.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="activity-member">Responsável</Label>
              <select
                id="activity-member"
                value={assignedMemberId}
                onChange={(e) => setAssignedMemberId(e.target.value)}
                className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Sem atribuição</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-3">
            <div className="space-y-2 flex-1">
              <Label htmlFor="activity-date">Data de início</Label>
              <Input
                id="activity-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2 w-28">
              <Label htmlFor="activity-hours">Horas est.</Label>
              <Input
                id="activity-hours"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="0"
                type="number"
                min="0"
                step="0.5"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditing ? 'Salvar alterações' : 'Criar atividade'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Create feature dialog ────────────────────────────────────────────────────

function CreateFeatureDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setDescription('')
      setPriority('medium')
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setIsPending(true)
    try {
      await createFeature(projectId, {
        name: name.trim(),
        description: description.trim() || undefined,
        priority,
      })
      toast.success('Feature criada.')
      onOpenChange(false)
    } catch {
      toast.error('Erro ao criar feature.')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Feature</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="feature-name">Nome *</Label>
            <Input
              id="feature-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Sistema de autenticação"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="feature-description">Descrição</Label>
            <textarea
              id="feature-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição opcional…"
              className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring min-h-[80px] resize-none"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="feature-priority">Prioridade</Label>
            <select
              id="feature-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {Object.entries(PRIORITY_CONFIG).map(([value, cfg]) => (
                <option key={value} value={value}>{cfg.label}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar Feature
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
