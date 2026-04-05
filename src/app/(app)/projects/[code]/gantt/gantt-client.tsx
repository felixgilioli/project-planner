'use client'

import { useState, useTransition, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { RefreshCw } from 'lucide-react'
import type { GanttTask } from 'frappe-gantt'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { AllocationTable } from '@/components/gantt/allocation-table'
import { MemberAvatar } from '@/components/members/member-card'
import { getGanttData, type GanttData } from '@/app/actions/gantt'

const GanttChart = dynamic(() => import('./gantt-chart'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
})

type ViewMode = 'Day' | 'Week'

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function progressFromStatus(status: string): number {
  if (status === 'done') return 100
  if (status === 'in_progress') return 50
  return 0
}

const FEATURE_COLOR_COUNT = 19

function buildTasks(data: GanttData, selectedMemberIds: Set<string>): GanttTask[] {
  const result: GanttTask[] = []
  let colorIdx = 0
  const filterActive = selectedMemberIds.size > 0

  for (const { feature, activities } of data.items) {
    const visibleActivities = filterActive
      ? activities.filter((a) => a.assignedMemberId && selectedMemberIds.has(a.assignedMemberId))
      : activities

    if (visibleActivities.length === 0) { colorIdx++; continue }

    const featureClass = `bar-fc${colorIdx % FEATURE_COLOR_COUNT}`
    const activityClass = `bar-fc${colorIdx % FEATURE_COLOR_COUNT}-light`
    colorIdx++

    // Feature bar always spans ALL activities (full duration), not just the filtered ones
    const starts = activities.map((a) => new Date(a.startDate!).getTime())
    const ends = activities.map((a) => new Date(a.estimatedEndDate!).getTime())
    const minStart = new Date(Math.min(...starts))
    const maxEnd = new Date(Math.max(...ends))

    result.push({
      id: feature.id,
      name: feature.name,
      start: toDateStr(minStart),
      end: toDateStr(maxEnd),
      progress: progressFromStatus(feature.status),
      dependencies: '',
      custom_class: featureClass,
      _isFeature: true,
    })

    for (const act of visibleActivities) {
      result.push({
        id: act.id,
        name: act.name,
        start: toDateStr(new Date(act.startDate!)),
        end: toDateStr(new Date(act.estimatedEndDate!)),
        progress: progressFromStatus(act.status),
        dependencies: '',
        custom_class: activityClass,
        _memberName: act.memberName ?? null,
        _estimatedHours: Number(act.estimatedHours),
        _status: act.status,
        _isFeature: false,
      })
    }
  }

  return result
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

interface GanttClientProps {
  projectId: string
  initialData: GanttData
  generatedAt: Date
}

export function GanttClient({ projectId, initialData, generatedAt }: GanttClientProps) {
  const [data, setData] = useState(initialData)
  const [viewMode, setViewMode] = useState<ViewMode>('Day')
  const [generatedTime, setGeneratedTime] = useState(generatedAt)
  const [isRefreshing, startRefresh] = useTransition()
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set())

  const members = useMemo(
    () => data.memberAllocations.map((a) => a.member),
    [data],
  )

  function toggleMember(id: string) {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const tasks = useMemo(() => buildTasks(data, selectedMemberIds), [data, selectedMemberIds])

  function handleRefresh() {
    startRefresh(async () => {
      const fresh = await getGanttData(projectId)
      setData(fresh)
      setGeneratedTime(new Date())
    })
  }

  const viewModes: { label: string; value: ViewMode }[] = [
    { label: 'Dia', value: 'Day' },
    { label: 'Semana', value: 'Week' },
  ]

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b flex-wrap">
        <div className="flex items-center gap-1">
          {viewModes.map(({ label, value }) => (
            <Button
              key={value}
              size="sm"
              variant={viewMode === value ? 'default' : 'outline'}
              onClick={() => setViewMode(value)}
            >
              {label}
            </Button>
          ))}
        </div>

        {members.length > 0 && (
          <div className="flex items-center gap-1.5">
            {members.map((member) => {
              const isSelected = selectedMemberIds.has(member.id)
              const isFiltering = selectedMemberIds.size > 0
              return (
                <button
                  key={member.id}
                  title={member.name}
                  onClick={() => toggleMember(member.id)}
                  className={[
                    'rounded-full transition-all outline-none',
                    isSelected
                      ? 'ring-2 ring-offset-1 ring-foreground'
                      : isFiltering
                        ? 'opacity-40 hover:opacity-70'
                        : 'hover:ring-2 hover:ring-offset-1 hover:ring-muted-foreground',
                  ].join(' ')}
                >
                  <MemberAvatar name={member.name} size="sm" />
                </button>
              )
            })}
          </div>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          Gerado em: {formatTime(generatedTime)}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {tasks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState title="Nenhuma atividade com datas calculadas ainda" />
        </div>
      ) : (
        <>
          {/* Gantt — 60% */}
          <div className="flex-[3] min-h-0 overflow-hidden">
            <GanttChart tasks={tasks} viewMode={viewMode} />
          </div>

          {/* Allocation table — 40% */}
          <div className="flex-[2] min-h-0 overflow-auto border-t">
            <div className="px-4 py-2 border-b bg-muted/40">
              <h2 className="text-sm font-semibold">Ocupação do time</h2>
            </div>
            <AllocationTable memberAllocations={data.memberAllocations} />
          </div>
        </>
      )}
    </div>
  )
}
