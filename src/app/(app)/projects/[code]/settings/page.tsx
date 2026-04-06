'use client'

import { useState, useTransition, useEffect } from 'react'
import { toast } from 'sonner'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { getProjectByCode } from '@/app/actions/projects'
import { getDeploymentSettings, saveDeploymentSettings } from '@/app/actions/deployment-settings'

const WEEKDAYS = [
  { value: 'monday', label: 'Segunda-feira' },
  { value: 'tuesday', label: 'Terça-feira' },
  { value: 'wednesday', label: 'Quarta-feira' },
  { value: 'thursday', label: 'Quinta-feira' },
  { value: 'friday', label: 'Sexta-feira' },
  { value: 'saturday', label: 'Sábado' },
  { value: 'sunday', label: 'Domingo' },
]

export default function SettingsPage() {
  const { code } = useParams<{ code: string }>()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [blockedWeekdays, setBlockedWeekdays] = useState<string[]>(['saturday', 'sunday'])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, startSave] = useTransition()

  useEffect(() => {
    async function load() {
      try {
        const project = await getProjectByCode(code)
        if (!project) return
        setProjectId(project.id)
        const settings = await getDeploymentSettings(project.id)
        if (settings) {
          setBlockedWeekdays(settings.blockedWeekdays)
        }
      } catch {
        toast.error('Erro ao carregar configurações.')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [code])

  function toggleWeekday(day: string) {
    setBlockedWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    )
  }

  function handleSave() {
    if (!projectId) return
    startSave(async () => {
      try {
        await saveDeploymentSettings(projectId, blockedWeekdays)
        toast.success('Configurações salvas com sucesso.')
      } catch {
        toast.error('Erro ao salvar configurações.')
      }
    })
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações do Projeto</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Implantação</CardTitle>
          <CardDescription>
            Defina quais dias da semana não podem receber implantações.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Carregando...</span>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {WEEKDAYS.map(({ value, label }) => (
                  <div key={value} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id={`weekday-${value}`}
                      checked={blockedWeekdays.includes(value)}
                      onChange={() => toggleWeekday(value)}
                      className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                    />
                    <Label htmlFor={`weekday-${value}`} className="cursor-pointer font-normal">
                      {label}
                    </Label>
                  </div>
                ))}
              </div>

              <p className="text-sm text-muted-foreground">
                Dias marcados não poderão receber implantações. Feriados e dias não úteis do
                calendário também são considerados.
              </p>

              <Button onClick={handleSave} disabled={isSaving || !projectId}>
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar configurações
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
