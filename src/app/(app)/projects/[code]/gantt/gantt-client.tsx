'use client'

import { useState, useTransition, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { RefreshCw } from 'lucide-react'
import type { GanttTask } from 'frappe-gantt'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { AllocationTable } from '@/components/gantt/allocation-table'
import { getGanttData, type GanttData } from '@/app/actions/gantt'

const GanttChart = dynamic(() => import('./gantt-chart'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
})

type ViewMode = 'Day' | 'Week' | 'Month'

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function progressFromStatus(status: string): number {
  if (status === 'done') return 100
  if (status === 'in_progress') return 50
  return 0
}

const FEATURE_COLOR_COUNT = 19

function buildTasks(data: GanttData): GanttTask[] {
  const result: GanttTask[] = []
  let colorIdx = 0

  for (const { feature, activities } of data.items) {
    if (activities.length === 0) continue

    const featureClass = `bar-fc${colorIdx % FEATURE_COLOR_COUNT}`
    const activityClass = `bar-fc${colorIdx % FEATURE_COLOR_COUNT}-light`
    colorIdx++

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

    for (const act of activities) {
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
  const [viewMode, setViewMode] = useState<ViewMode>('Week')
  const [generatedTime, setGeneratedTime] = useState(generatedAt)
  const [isRefreshing, startRefresh] = useTransition()

  const tasks = useMemo(() => buildTasks(data), [data])

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
    { label: 'Mês', value: 'Month' },
  ]

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b">
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
            <AllocationTable memberAllocations={data.memberAllocations} />
          </div>
        </>
      )}
    </div>
  )
}
