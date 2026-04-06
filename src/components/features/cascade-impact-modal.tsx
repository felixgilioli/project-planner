'use client'

import React from 'react'
import { Loader2, Rocket } from 'lucide-react'
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
import type { CascadeResult, ImpactedItem, DeploymentConflict } from '@/lib/cascade/recalculate'

export type DeploymentResolutionChoice = {
  featureId: string
  keep: boolean
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  cascadeResult: CascadeResult
  onConfirm: (deploymentResolutions: DeploymentResolutionChoice[]) => Promise<void>
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

function DeploymentConflictRow({
  conflict,
  choice,
  onChoose,
}: {
  conflict: DeploymentConflict
  choice: boolean | undefined
  onChoose: (keep: boolean) => void
}) {
  return (
    <div className="py-2 border-b border-border/50 last:border-0">
      <div className="flex items-start gap-2 mb-2">
        <Rocket className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />
        <span className="text-sm font-medium">{conflict.featureName}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-2 pl-5">
        Data atual: <strong>{formatISODateBR(conflict.currentDeploymentDate)}</strong>
        {' · '}
        Sugerida: <strong>{formatISODateBR(conflict.suggestedDeploymentDate)}</strong>
      </p>
      <div className="flex gap-2 pl-5">
        <Button
          size="sm"
          variant={choice === true ? 'default' : 'outline'}
          className="h-7 text-xs"
          onClick={() => onChoose(true)}
        >
          Manter {formatISODateBR(conflict.currentDeploymentDate)}
        </Button>
        <Button
          size="sm"
          variant={choice === false ? 'default' : 'outline'}
          className="h-7 text-xs"
          onClick={() => onChoose(false)}
        >
          Recalcular para {formatISODateBR(conflict.suggestedDeploymentDate)}
        </Button>
      </div>
    </div>
  )
}

export function CascadeImpactModal({ open, onOpenChange, cascadeResult, onConfirm, isPending }: Props) {
  const activityItems = cascadeResult.impactedItems.filter((i) => i.type === 'activity')
  const featureItems = cascadeResult.impactedItems.filter((i) => i.type === 'feature')
  const total = cascadeResult.impactedItems.length
  const conflicts = cascadeResult.deploymentConflicts ?? []

  const [resolutions, setResolutions] = React.useState<Record<string, boolean>>({})

  // Reset when modal opens
  React.useEffect(() => {
    if (open) setResolutions({})
  }, [open])

  const allConflictsResolved =
    conflicts.length === 0 || conflicts.every((c) => resolutions[c.featureId] !== undefined)

  function handleConfirm() {
    const deploymentResolutions: DeploymentResolutionChoice[] = conflicts.map((c) => ({
      featureId: c.featureId,
      keep: resolutions[c.featureId] ?? true,
    }))
    onConfirm(deploymentResolutions)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Impacto em cascata</DialogTitle>
          <DialogDescription>
            {total > 0
              ? `${total} ${total === 1 ? 'item será afetado' : 'itens serão afetados'} por essa alteração. Revise antes de confirmar.`
              : 'Verifique as datas de implantação afetadas abaixo.'}
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
          {conflicts.length > 0 && (
            <section>
              <h4 className="text-sm font-semibold mb-1 text-foreground flex items-center gap-1.5">
                <Rocket className="h-3.5 w-3.5 text-amber-500" />
                Datas de implantação — decisão necessária ({conflicts.length})
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                Estas features possuem datas de implantação definidas manualmente. Escolha o que
                fazer para cada uma:
              </p>
              <div>
                {conflicts.map((conflict) => (
                  <DeploymentConflictRow
                    key={conflict.featureId}
                    conflict={conflict}
                    choice={resolutions[conflict.featureId]}
                    onChoose={(keep) =>
                      setResolutions((prev) => ({ ...prev, [conflict.featureId]: keep }))
                    }
                  />
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
          <Button onClick={handleConfirm} disabled={isPending || !allConflictsResolved}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirmar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

