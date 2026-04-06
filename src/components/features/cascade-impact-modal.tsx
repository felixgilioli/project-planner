'use client'

import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { CascadeResult, ImpactedItem } from '@/lib/cascade/recalculate'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  cascadeResult: CascadeResult
  onConfirm: () => Promise<void>
  isPending: boolean
}

function formatISODateBR(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function dateDeltaDays(oldIso: string | null, newIso: string | null): number | null {
  if (!oldIso || !newIso) return null
  return Math.round((new Date(newIso).getTime() - new Date(oldIso).getTime()) / 86400000)
}

function ImpactRow({ item }: { item: ImpactedItem }) {
  const delta = dateDeltaDays(item.oldEndDate, item.newEndDate)
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-border/50 last:border-0 text-sm">
      <span className="flex-1 truncate font-medium">{item.name}</span>
      <span className="text-muted-foreground text-xs tabular-nums whitespace-nowrap">
        {formatISODateBR(item.oldStartDate)} → {formatISODateBR(item.oldEndDate)}
        <span className="mx-1.5 text-muted-foreground/50">›</span>
        {formatISODateBR(item.newStartDate)} → {formatISODateBR(item.newEndDate)}
      </span>
      {delta !== null && delta !== 0 && (
        <Badge variant={delta > 0 ? 'destructive' : 'success'} className="shrink-0">
          {delta > 0 ? `+${delta}d` : `${delta}d`}
        </Badge>
      )}
    </div>
  )
}

export function CascadeImpactModal({ open, onOpenChange, cascadeResult, onConfirm, isPending }: Props) {
  const activityItems = cascadeResult.impactedItems.filter((i) => i.type === 'activity')
  const featureItems = cascadeResult.impactedItems.filter((i) => i.type === 'feature')
  const total = cascadeResult.impactedItems.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Impacto em cascata</DialogTitle>
          <DialogDescription>
            {total} {total === 1 ? 'item será afetado' : 'itens serão afetados'} por essa
            alteração. Revise antes de confirmar.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-96 overflow-y-auto space-y-4 pr-1">
          {activityItems.length > 0 && (
            <section>
              <h4 className="text-sm font-semibold mb-1 text-foreground">
                Atividades afetadas ({activityItems.length})
              </h4>
              <div>
                {activityItems.map((item) => (
                  <ImpactRow key={item.id} item={item} />
                ))}
              </div>
            </section>
          )}
          {featureItems.length > 0 && (
            <section>
              <h4 className="text-sm font-semibold mb-1 text-foreground">
                Features afetadas ({featureItems.length})
              </h4>
              <div>
                {featureItems.map((item) => (
                  <ImpactRow key={item.id} item={item} />
                ))}
              </div>
            </section>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirmar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
