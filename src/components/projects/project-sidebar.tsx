'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { List, Users, Calendar, BarChart2, ChevronLeft, Settings, Moon, Sun, LayoutDashboard, MessageCircle, SlidersHorizontal, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Project } from '@/lib/db/schema'

interface ProjectSidebarProps {
  project: Project
  userName: string
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function ProjectSidebar({ project, userName }: ProjectSidebarProps) {
  const pathname = usePathname()
  const { resolvedTheme, setTheme } = useTheme()

  const navItems = [
    { href: `/projects/${project.code}/overview`, icon: LayoutDashboard, label: 'Overview' },
    { href: `/projects/${project.code}/features`, icon: List, label: 'Features' },
    { href: `/projects/${project.code}/members`, icon: Users, label: 'Membros' },
    { href: `/projects/${project.code}/calendar`, icon: Calendar, label: 'Calendário' },
    { href: `/projects/${project.code}/gantt`, icon: BarChart2, label: 'Gantt' },
    { href: `/projects/${project.code}/daily`, icon: MessageCircle, label: 'Daily' },
    { href: `/projects/${project.code}/reports`, icon: FileText, label: 'Relatórios' },
    { href: `/projects/${project.code}/settings`, icon: SlidersHorizontal, label: 'Configurações' },
  ]

  return (
    <aside className="w-60 flex flex-col border-r bg-muted/20 shrink-0">
      {/* Top */}
      <div className="p-4 border-b">
        <Link
          href="/projects"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3 transition-colors"
        >
          <ChevronLeft className="h-3 w-3" />
          Todos os projetos
        </Link>
        <div className="flex items-center gap-2">
          <div
            className="h-3 w-3 rounded-full shrink-0"
            style={{ backgroundColor: project.color }}
          />
          <span className="font-semibold text-sm leading-tight line-clamp-2">{project.name}</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-0.5">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="p-4 border-t">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <span className="text-xs font-semibold text-primary">{getInitials(userName)}</span>
          </div>
          <span className="text-sm font-medium truncate flex-1">{userName}</span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0">
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="w-48">
              <DropdownMenuLabel>Configurações</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                className="cursor-pointer"
              >
                {resolvedTheme === 'dark' ? (
                  <>
                    <Sun className="h-4 w-4 mr-2" />
                    Modo claro
                  </>
                ) : (
                  <>
                    <Moon className="h-4 w-4 mr-2" />
                    Modo escuro
                  </>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </aside>
  )
}
