'use client'

import { useEffect, useRef } from 'react'
import Gantt, { type GanttTask, type PopupContext } from 'frappe-gantt'

type PopupCtx = PopupContext & {
  add_action: (html: string, func: () => void) => void
}

const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  in_progress: 'Em andamento',
  done: 'Concluído',
  blocked: 'Bloqueado',
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

interface GanttChartProps {
  tasks: GanttTask[]
  viewMode: string
  onViewComments: (featureId: string, featureName: string) => void
}

export default function GanttChart({ tasks, viewMode, onViewComments }: GanttChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const ganttRef = useRef<Gantt | null>(null)
  const onViewCommentsRef = useRef(onViewComments)
  onViewCommentsRef.current = onViewComments

  useEffect(() => {
    if (!containerRef.current || tasks.length === 0) return

    containerRef.current.innerHTML = ''

    function buildPopup(ctx: PopupCtx) {
      const task = ctx.task
      ctx.set_title(task.name as string)

      const isFeature = task._isFeature as boolean
      const isDeployment = task._isDeployment as boolean
      const featureId = isFeature ? task.id : (task._featureId as string)
      const featureName = isFeature ? (task.name as string) : (task._featureName as string)

      if (isDeployment) {
        const depDate = task._deploymentDate as string
        const [y, m, d] = depDate.split('-')
        const isManual = task._deploymentManual as boolean
        ctx.set_subtitle('')
        ctx.set_details(
          `<b>Implantação:</b> ${d}/${m}/${y}` +
          (isManual ? '<br/><i>+ definida manualmente</i>' : ''),
        )
      } else if (isFeature) {
        ctx.set_subtitle('')
        ctx.set_details('')
      } else {
        const lines: string[] = []
        if (task._memberName) lines.push(`<b>Responsável:</b> ${task._memberName as string}`)
        lines.push(`<b>Início:</b> ${formatDate(ctx.task._start)}`)
        lines.push(`<b>Fim:</b> ${formatDate(ctx.task._end)}`)
        if (task._estimatedHours) lines.push(`<b>Horas:</b> ${task._estimatedHours as number}h`)
        if (task._status) lines.push(`<b>Status:</b> ${STATUS_LABELS[task._status as string] ?? task._status}`)
        ctx.set_subtitle('')
        ctx.set_details(lines.join('<br/>'))
      }

      if (featureId && !isDeployment) {
        ctx.add_action('💬 Ver atualizações', () => {
          onViewCommentsRef.current(featureId, featureName)
        })
      }
    }

    ganttRef.current = new Gantt(containerRef.current, tasks, {
      view_mode: viewMode,
      language: 'pt',
      bar_height: 28,
      today_button: true,
      scroll_to: 'today',
      popup: buildPopup as (ctx: PopupContext) => void,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks])

  useEffect(() => {
    if (ganttRef.current) {
      ganttRef.current.change_view_mode(viewMode)
    }
  }, [viewMode])

  return <div ref={containerRef} className="h-full w-full overflow-x-auto" />
}
