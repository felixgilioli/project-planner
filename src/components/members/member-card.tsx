'use client'

import { useState } from 'react'
import { MoreHorizontal, Pencil, UserX } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { deleteMember } from '@/app/actions/members'
import type { TeamMember } from '@/lib/db/schema'

// ─── Avatar utils ─────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-violet-500',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-fuchsia-500',
  'bg-orange-500',
]

export function getAvatarColor(name: string): string {
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ─── MemberAvatar ─────────────────────────────────────────────────────────────

interface MemberAvatarProps {
  name: string
  size?: 'sm' | 'md'
}

export function MemberAvatar({ name, size = 'md' }: MemberAvatarProps) {
  const color = getAvatarColor(name)
  const initials = getInitials(name)
  const sizeClass = size === 'sm' ? 'h-6 w-6 text-xs' : 'h-10 w-10 text-sm'

  return (
    <div
      className={`${color} ${sizeClass} rounded-full flex items-center justify-center text-white font-semibold shrink-0`}
    >
      {initials}
    </div>
  )
}

// ─── MemberCard ───────────────────────────────────────────────────────────────

interface MemberCardProps {
  member: TeamMember
  onEdit: (member: TeamMember) => void
}

export function MemberCard({ member, onEdit }: MemberCardProps) {
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [isDeactivating, setIsDeactivating] = useState(false)

  async function handleDeactivate() {
    setIsDeactivating(true)
    try {
      await deleteMember(member.id)
      toast.success(`${member.name} foi desativado.`)
    } catch {
      toast.error('Erro ao desativar membro.')
    } finally {
      setIsDeactivating(false)
      setDeactivateOpen(false)
    }
  }

  return (
    <>
      <div className="bg-card border rounded-lg p-4 flex flex-col gap-3">
        {/* Top row: avatar + name + menu */}
        <div className="flex items-start gap-3">
          <MemberAvatar name={member.name} />

          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{member.name}</p>
            {member.roleDescription && (
              <p className="text-xs text-muted-foreground truncate">{member.roleDescription}</p>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(member)}>
                <Pencil className="h-4 w-4 mr-2" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeactivateOpen(true)}
              >
                <UserX className="h-4 w-4 mr-2" />
                Desativar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Email */}
        {member.email && (
          <p className="text-xs text-muted-foreground truncate">{member.email}</p>
        )}

        {/* Footer: capacity + badge */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {parseFloat(member.dailyCapacityHours ?? '8')}h / dia
          </span>
          <Badge className="bg-emerald-100 text-emerald-800 border-0 text-xs">Ativo</Badge>
        </div>
      </div>

      <AlertDialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar membro</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja desativar <strong>{member.name}</strong>? O membro não
              aparecerá mais nas listas de atribuição.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeactivating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              disabled={isDeactivating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeactivating ? 'Desativando…' : 'Desativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
