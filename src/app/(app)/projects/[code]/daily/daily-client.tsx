'use client'

import { useState, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { createComment } from '@/app/actions/feature-comments'
import { updateActivity, confirmActivityUpdate } from '@/app/actions/activities'
import type { Project } from '@/lib/db/schema'
import type { MemberWithActivities, ActivityWithFeature } from '@/app/actions/daily'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function formatShortDate(date: Date | null | string): string | null {
  if (!date) return null
  return new Date(date).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
}

function formatLongDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function getDeadlineStatus(date: Date | null | string): 'today' | 'overdue' | null {
  if (!date) return null
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (d.getTime() === today.getTime()) return 'today'
  if (d < today) return 'overdue'
  return null
}

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  backlog: {
    label: 'Backlog',
    className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  },
  in_progress: {
    label: 'Em andamento',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  },
  done: {
    label: 'Concluído',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
  },
  blocked: {
    label: 'Bloqueado',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
  },
} as const

const COMMENT_TYPES = [
  { value: 'update', label: 'Atualização' },
  { value: 'impediment', label: 'Impedimento' },
  { value: 'requirement_change', label: 'Mudança de requisito' },
] as const

type CommentType = (typeof COMMENT_TYPES)[number]['value']

// ─── Main component ───────────────────────────────────────────────────────────

interface DailyClientProps {
  project: Project
  initialData: MemberWithActivities[]
}

export function DailyClient({ project, initialData }: DailyClientProps) {
  const [data, setData] = useState(initialData)
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(
    initialData[0]?.member.id ?? null,
  )
  const [attendedIds, setAttendedIds] = useState<Set<string>>(new Set())
  const [commentType, setCommentType] = useState<CommentType>('update')
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(
    initialData[0]?.activities[0]?.id ?? null,
  )
  const [commentText, setCommentText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const formattedDate = formatLongDate(new Date())

  const selectedMemberData = useMemo(
    () => data.find((d) => d.member.id === selectedMemberId) ?? null,
    [data, selectedMemberId],
  )

  const selectedActivity = useMemo(
    () => selectedMemberData?.activities.find((a) => a.id === selectedActivityId) ?? null,
    [selectedMemberData, selectedActivityId],
  )

  function handleSelectMember(memberId: string) {
    setSelectedMemberId(memberId)
    const memberData = data.find((d) => d.member.id === memberId)
    setSelectedActivityId(memberData?.activities[0]?.id ?? null)
  }

  function getPlaceholder(type: CommentType, memberName: string): string {
    const firstName = memberName.split(' ')[0]
    switch (type) {
      case 'update':
        return `O que ${firstName} reportou sobre essa atividade?`
      case 'impediment':
        return `Qual o bloqueio reportado por ${firstName}?`
      case 'requirement_change':
        return 'Qual mudança de requisito foi reportada?'
    }
  }

  async function handleStatusChange(activityId: string, newStatus: string) {
    try {
      const result = await updateActivity(activityId, { status: newStatus })
      if (result.requiresConfirmation) {
        await confirmActivityUpdate(activityId, { status: newStatus })
      }
      setData((prev) =>
        prev.map((memberData) => ({
          ...memberData,
          activities: memberData.activities.map((act) =>
            act.id === activityId ? { ...act, status: newStatus } : act,
          ),
        })),
      )
      toast.success('Status atualizado.')
    } catch {
      toast.error('Erro ao atualizar status.')
    }
  }

  async function handleSubmit() {
    if (!selectedActivity || !commentText.trim() || !selectedMemberId) return
    setIsSubmitting(true)
    try {
      await createComment(selectedActivity.featureId, {
        content: commentText.trim(),
        type: commentType,
      })
      setCommentText('')
      setAttendedIds((prev) => new Set([...prev, selectedMemberId]))
      toast.success('Registro salvo.')
    } catch {
      toast.error('Erro ao registrar comentário.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left column — member list ── */}
      <div className="w-[260px] flex flex-col border-r shrink-0">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-sm">Daily</h2>
          <p className="text-xs text-muted-foreground capitalize mt-0.5">{formattedDate}</p>
          <p className="text-xs font-medium mt-1 truncate">{project.name}</p>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {data.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center mt-8 px-4">
              Nenhum membro ativo no projeto.
            </p>
          ) : (
            data.map(({ member }) => {
              const isSelected = member.id === selectedMemberId
              const isAttended = attendedIds.has(member.id)
              return (
                <button
                  key={member.id}
                  onClick={() => handleSelectMember(member.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-l-2',
                    isSelected
                      ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500'
                      : 'border-transparent hover:bg-muted',
                  )}
                >
                  <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-primary">
                      {getInitials(member.name)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{member.name}</p>
                    {member.roleDescription && (
                      <p className="text-xs text-muted-foreground truncate">
                        {member.roleDescription}
                      </p>
                    )}
                  </div>
                  <div
                    className={cn(
                      'h-2 w-2 rounded-full shrink-0',
                      isAttended ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600',
                    )}
                  />
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Right column — member panel ── */}
      {selectedMemberData ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Activity list */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-4">
              <h3 className="font-semibold">{selectedMemberData.member.name}</h3>
              {selectedMemberData.member.roleDescription && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedMemberData.member.roleDescription}
                </p>
              )}
            </div>

            {selectedMemberData.activities.length === 0 ? (
              <div className="flex items-center justify-center h-40 rounded-lg border border-dashed">
                <p className="text-sm text-muted-foreground">
                  Nenhuma atividade atribuída a{' '}
                  {selectedMemberData.member.name.split(' ')[0]}.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedMemberData.activities.map((activity) => (
                  <ActivityCard
                    key={activity.id}
                    activity={activity}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Registration area */}
          <div className="border-t p-5 space-y-3 bg-muted/20 shrink-0">
            {/* Comment type pills */}
            <div className="flex gap-2 flex-wrap">
              {COMMENT_TYPES.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setCommentType(type.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                    commentType === type.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/60',
                  )}
                >
                  {type.label}
                </button>
              ))}
            </div>

            {/* Activity select + feature label */}
            {selectedMemberData.activities.length > 0 && (
              <div className="space-y-1.5">
                <select
                  value={selectedActivityId ?? ''}
                  onChange={(e) => setSelectedActivityId(e.target.value || null)}
                  className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {selectedMemberData.activities.map((act) => (
                    <option key={act.id} value={act.id}>
                      {act.name}
                    </option>
                  ))}
                </select>
                {selectedActivity && (
                  <p className="text-xs text-muted-foreground">
                    Registro vinculado à feature:{' '}
                    <span className="font-medium text-foreground">
                      {selectedActivity.featureName}
                    </span>
                  </p>
                )}
              </div>
            )}

            {/* Textarea */}
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={
                selectedMemberData
                  ? getPlaceholder(commentType, selectedMemberData.member.name)
                  : ''
              }
              rows={3}
              className="w-full text-sm border rounded-md px-3 py-2 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
            />

            <div className="flex justify-end">
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !commentText.trim() || !selectedActivity}
              >
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Registrar
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Selecione um membro para iniciar a daily.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Activity card ────────────────────────────────────────────────────────────

interface ActivityCardProps {
  activity: ActivityWithFeature
  onStatusChange: (id: string, status: string) => void
}

function ActivityCard({ activity, onStatusChange }: ActivityCardProps) {
  const deadlineStatus = getDeadlineStatus(activity.estimatedEndDate)
  const dateLabel = formatShortDate(activity.estimatedEndDate)
  const statusConfig =
    STATUS_CONFIG[activity.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.backlog

  return (
    <div className="flex items-start gap-3 p-4 rounded-lg border bg-card">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span
            className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium',
              statusConfig.className,
            )}
          >
            {statusConfig.label}
          </span>
          {dateLabel && (
            <span
              className={cn(
                'text-xs',
                deadlineStatus === 'today' || deadlineStatus === 'overdue'
                  ? 'text-red-500 font-medium'
                  : 'text-muted-foreground',
              )}
            >
              {deadlineStatus === 'today'
                ? 'vence hoje'
                : deadlineStatus === 'overdue'
                  ? 'atrasada'
                  : dateLabel}
            </span>
          )}
        </div>
        <p className="text-sm font-medium">{activity.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{activity.featureName}</p>
      </div>

      <select
        value={activity.status}
        onChange={(e) => onStatusChange(activity.id, e.target.value)}
        className="text-xs border rounded-md px-2 py-1.5 bg-background focus:outline-none shrink-0"
      >
        {Object.entries(STATUS_CONFIG).map(([value, config]) => (
          <option key={value} value={value}>
            {config.label}
          </option>
        ))}
      </select>
    </div>
  )
}
