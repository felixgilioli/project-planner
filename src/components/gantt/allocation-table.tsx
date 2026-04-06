'use client'

import { cn } from '@/lib/utils'
import type { MemberAllocation } from '@/app/actions/gantt'

function weekKeyToLabel(key: string): string {
  const [yearStr, weekStr] = key.split('-')
  const year = parseInt(yearStr)
  const week = parseInt(weekStr)
  // Find January 4th (always in ISO week 1)
  const jan4 = new Date(year, 0, 4)
  const dayOfWeek = jan4.getDay() || 7
  const monday = new Date(jan4)
  monday.setDate(jan4.getDate() - (dayOfWeek - 1) + (week - 1) * 7)
  return monday.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '')
}

function cellColor(hours: number, capacity: number): string {
  if (hours === 0) return ''
  const pct = hours / capacity
  if (pct < 0.8) return 'bg-[#D1FAE5] text-gray-900 dark:bg-emerald-900/40 dark:text-emerald-200'
  if (pct <= 1.0) return 'bg-[#FEF3C7] text-gray-900 dark:bg-amber-900/40 dark:text-amber-200'
  return 'bg-[#FEE2E2] text-gray-900 dark:bg-red-900/40 dark:text-red-200'
}

interface AllocationTableProps {
  memberAllocations: MemberAllocation[]
}

export function AllocationTable({ memberAllocations }: AllocationTableProps) {
  const allWeeks = [
    ...new Set(memberAllocations.flatMap((m) => Object.keys(m.weeklyHours))),
  ].sort()

  if (allWeeks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground py-8">
        Nenhuma alocação no período
      </div>
    )
  }

  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b bg-muted/40">
          <th className="sticky left-0 bg-muted/40 text-left px-4 py-2 font-medium whitespace-nowrap min-w-[140px]">
            Membro
          </th>
          {allWeeks.map((w) => (
            <th key={w} className="px-3 py-2 font-medium text-center whitespace-nowrap min-w-[90px]">
              {weekKeyToLabel(w)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {memberAllocations.map(({ member, weeklyHours }) => {
          const cap = member.dailyCapacityHours * 5
          return (
            <tr key={member.id} className="border-b last:border-0">
              <td className="sticky left-0 bg-background px-4 py-2 font-medium whitespace-nowrap">
                {member.name}
              </td>
              {allWeeks.map((w) => {
                const h = weeklyHours[w] ?? 0
                return (
                  <td
                    key={w}
                    className={cn('text-center px-3 py-2 tabular-nums', cellColor(h, cap))}
                  >
                    {h > 0 ? `${h}h / ${cap}h` : <span className="text-muted-foreground">—</span>}
                  </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
