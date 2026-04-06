import { redirect } from 'next/navigation'
import { AlertTriangle, Calendar, CheckCircle2, Layers } from 'lucide-react'
import { getProjectByCode } from '@/app/actions/projects'
import { getOverviewData } from '@/app/actions/overview'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'

interface OverviewPageProps {
  params: Promise<{ code: string }>
}

const STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog',
  in_progress: 'Em progresso',
  done: 'Concluída',
  blocked: 'Bloqueada',
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  backlog: 'secondary',
  in_progress: 'default',
  done: 'outline',
  blocked: 'destructive',
}

const COMMENT_TYPE_LABEL: Record<string, string> = {
  update: 'Atualização',
  impediment: 'Impedimento',
  decision: 'Decisão',
  note: 'Nota',
}

function formatDate(date: Date | null) {
  if (!date) return '—'
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function utilizationColor(percent: number) {
  if (percent > 100) return 'bg-red-500'
  if (percent >= 70) return 'bg-yellow-500'
  return 'bg-green-500'
}

function utilizationTextColor(percent: number) {
  if (percent > 100) return 'text-red-600 dark:text-red-400'
  if (percent >= 70) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-green-600 dark:text-green-400'
}

export default async function OverviewPage({ params }: OverviewPageProps) {
  const { code } = await params

  const project = await getProjectByCode(code)
  if (!project) redirect('/projects')

  const data = await getOverviewData(project.id)
  if (!data) redirect('/projects')

  const { metrics, featureProgress, teamOccupation, upcomingDeliveries, recentComments } = data

  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="p-6 space-y-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground capitalize">{today}</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Features
            </CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{metrics.totalFeatures}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Progresso Geral
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{metrics.overallProgress}%</p>
            <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${metrics.overallProgress}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Entrega Estimada
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold leading-tight">
              {metrics.deliveryDate ? formatDate(metrics.deliveryDate) : '—'}
            </p>
            {!metrics.deliveryDate && (
              <p className="text-xs text-muted-foreground mt-1">Sem atividades planejadas</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Impedimentos
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p
              className={`text-3xl font-bold ${
                metrics.openImpediments > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-green-600 dark:text-green-400'
              }`}
            >
              {metrics.openImpediments}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Middle row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Feature progress */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Progresso por Feature</CardTitle>
          </CardHeader>
          <CardContent>
            {featureProgress.length === 0 ? (
              <EmptyState
                title="Nenhuma feature cadastrada"
                description="Acesse a aba Features para adicionar as primeiras features do projeto."
              />
            ) : (
              <ul className="space-y-4">
                {featureProgress.map(({ feature, totalActivities, doneActivities, progressPercent }) => (
                  <li key={feature.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium truncate max-w-[60%]">{feature.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0 ml-2">
                        {totalActivities === 0
                          ? 'Sem atividades'
                          : `${doneActivities}/${totalActivities} atividades`}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{progressPercent}%</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Team occupation */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ocupação do Time</CardTitle>
          </CardHeader>
          <CardContent>
            {teamOccupation.length === 0 ? (
              <EmptyState
                title="Nenhum membro no time"
                description="Acesse a aba Membros para adicionar pessoas ao projeto."
              />
            ) : (
              <ul className="space-y-4">
                {teamOccupation.map(({ member, assignedHours, utilizationPercent }) => (
                  <li key={member.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium truncate max-w-[60%]">{member.name}</span>
                      <span
                        className={`text-xs font-medium shrink-0 ml-2 ${utilizationTextColor(utilizationPercent)}`}
                      >
                        {assignedHours.toFixed(1)}h — {utilizationPercent}%
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${utilizationColor(utilizationPercent)}`}
                        style={{ width: `${Math.min(utilizationPercent, 100)}%` }}
                      />
                    </div>
                    {utilizationPercent > 100 && (
                      <p className="text-xs text-red-500 mt-1">
                        Sobrecarga: {utilizationPercent - 100}% acima da capacidade
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Upcoming deliveries */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Próximas Entregas</CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingDeliveries.length === 0 ? (
              <EmptyState
                title="Sem entregas planejadas"
                description="As features aparecerão aqui conforme as atividades tiverem datas estimadas."
              />
            ) : (
              <ul className="divide-y">
                {upcomingDeliveries.map((feature) => (
                  <li key={feature.id} className="flex items-center justify-between py-3 gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant={STATUS_VARIANT[feature.status] ?? 'secondary'}>
                        {STATUS_LABEL[feature.status] ?? feature.status}
                      </Badge>
                      <span className="text-sm truncate">{feature.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDate(feature.estimatedEndDate)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recent diary entries */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimos Registros do Diário</CardTitle>
          </CardHeader>
          <CardContent>
            {recentComments.length === 0 ? (
              <EmptyState
                title="Nenhum registro ainda"
                description="Os comentários e atualizações das features aparecerão aqui."
              />
            ) : (
              <ul className="space-y-4">
                {recentComments.map((comment) => (
                  <li key={comment.id} className="text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">
                        {COMMENT_TYPE_LABEL[comment.type] ?? comment.type}
                      </Badge>
                      <span className="text-xs text-muted-foreground truncate">
                        {comment.featureName}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto shrink-0">
                        {formatDate(comment.createdAt)}
                      </span>
                    </div>
                    <p className="text-muted-foreground line-clamp-2">{comment.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
