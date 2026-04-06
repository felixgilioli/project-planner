'use client'

import { useState } from 'react'
import { AlertTriangle, Lock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface BlockedFeature {
  feature: { id: string; name: string }
  lastImpediment: { content: string; createdAt: Date } | null
}

interface BlockedFeaturesCardProps {
  count: number
  blockedFeatures: BlockedFeature[]
}

export function BlockedFeaturesCard({ count, blockedFeatures }: BlockedFeaturesCardProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Card
        className={count > 0 ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}
        onClick={() => count > 0 && setOpen(true)}
        title={count > 0 ? 'Clique para ver as features bloqueadas' : undefined}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium text-muted-foreground">Impedimentos</CardTitle>
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p
            className={`text-3xl font-bold ${
              count > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
            }`}
          >
            {count}
          </p>
          {count > 0 && (
            <p className="text-xs text-muted-foreground mt-1">Clique para visualizar</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <Lock className="h-4 w-4" />
              Features Bloqueadas ({count})
            </DialogTitle>
          </DialogHeader>
          <ul className="divide-y mt-2">
            {blockedFeatures.map(({ feature, lastImpediment }) => (
              <li key={feature.id} className="py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-medium">{feature.name}</p>
                {lastImpediment ? (
                  <p className="text-sm text-muted-foreground mt-0.5">{lastImpediment.content}</p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5 italic">
                    Sem comentário de bloqueio registrado.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
