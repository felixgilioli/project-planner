'use server'

import { revalidatePath } from 'next/cache'
import { eq, and, asc, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { projects, calendars, calendarDays } from '@/lib/db/schema'
import { getAuthenticatedTenantId } from '@/lib/auth'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CalendarDayData = {
  date: string // 'YYYY-MM-DD'
  type: 'working' | 'non_working'
  reason: string | null
}

export type CalendarResult = {
  calendarId: string | null
  days: CalendarDayData[]
  workingDaysCount: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  return day === 0 || day === 6
}

function generateYearDays(year: number): CalendarDayData[] {
  const days: CalendarDayData[] = []
  const start = new Date(year, 0, 1)
  const end = new Date(year, 11, 31)

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10)
    const dow = d.getDay()
    const weekend = dow === 0 || dow === 6
    days.push({
      date: dateStr,
      type: weekend ? 'non_working' : 'working',
      reason: weekend ? 'Fim de semana' : null,
    })
  }

  return days
}

// ─── Easter algorithm (Meeus/Jones/Butcher) ───────────────────────────────────

function getEasterDate(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1 // 0-indexed
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month, day)
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// ─── Server Actions ───────────────────────────────────────────────────────────

export async function getCalendar(projectId: string, year: number): Promise<CalendarResult> {
  const tenantId = await getAuthenticatedTenantId()

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1)

  if (!project) throw new Error('Projeto não encontrado')

  const [calendar] = await db
    .select()
    .from(calendars)
    .where(and(eq(calendars.projectId, projectId), eq(calendars.year, year)))
    .limit(1)

  if (!calendar) {
    const days = generateYearDays(year)
    return {
      calendarId: null,
      days,
      workingDaysCount: days.filter((d) => d.type === 'working').length,
    }
  }

  const dbDays = await db
    .select()
    .from(calendarDays)
    .where(eq(calendarDays.calendarId, calendar.id))
    .orderBy(asc(calendarDays.date))

  const days: CalendarDayData[] = dbDays.map((d) => ({
    date: d.date,
    type: d.type as 'working' | 'non_working',
    reason: d.reason,
  }))

  return {
    calendarId: calendar.id,
    days,
    workingDaysCount: days.filter((d) => d.type === 'working').length,
  }
}

export async function saveCalendar(
  projectId: string,
  year: number,
  nonWorkingDays: { date: string; reason: string | null }[],
): Promise<void> {
  const tenantId = await getAuthenticatedTenantId()

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1)

  if (!project) throw new Error('Projeto não encontrado')

  // Upsert calendar record
  const [calendar] = await db
    .insert(calendars)
    .values({ tenantId, projectId, year })
    .onConflictDoUpdate({
      target: [calendars.projectId, calendars.year],
      set: { updatedAt: new Date() },
    })
    .returning()

  // Build non-working day lookup (excluding weekends — they're handled separately)
  const nonWorkingMap = new Map(nonWorkingDays.map((d) => [d.date, d.reason]))

  // Generate all days of the year
  const allDays = generateYearDays(year)

  // Build rows with correct type/reason
  const rows = allDays.map((d) => {
    if (isWeekend(d.date)) {
      return { calendarId: calendar.id, date: d.date, type: 'non_working' as const, reason: 'Fim de semana' }
    }
    if (nonWorkingMap.has(d.date)) {
      return { calendarId: calendar.id, date: d.date, type: 'non_working' as const, reason: nonWorkingMap.get(d.date) ?? null }
    }
    return { calendarId: calendar.id, date: d.date, type: 'working' as const, reason: null }
  })

  // Upsert in chunks of 100 to avoid query size limits
  const CHUNK = 100
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db
      .insert(calendarDays)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoUpdate({
        target: [calendarDays.calendarId, calendarDays.date],
        set: { type: sql`excluded.type`, reason: sql`excluded.reason` },
      })
  }

  revalidatePath(`/projects/${projectId}/calendar`)
}

export async function toggleDay(
  projectId: string,
  year: number,
  dateStr: string,
  reason?: string | null,
): Promise<void> {
  const tenantId = await getAuthenticatedTenantId()

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1)

  if (!project) throw new Error('Projeto não encontrado')

  // Get or create calendar
  let [calendar] = await db
    .select()
    .from(calendars)
    .where(and(eq(calendars.projectId, projectId), eq(calendars.year, year)))
    .limit(1)

  if (!calendar) {
    // Create calendar first with empty non-working days
    await saveCalendar(projectId, year, [])
    const [created] = await db
      .select()
      .from(calendars)
      .where(and(eq(calendars.projectId, projectId), eq(calendars.year, year)))
      .limit(1)
    calendar = created
  }

  // Find existing day record
  const [existing] = await db
    .select()
    .from(calendarDays)
    .where(and(eq(calendarDays.calendarId, calendar.id), eq(calendarDays.date, dateStr)))
    .limit(1)

  if (!existing) return

  const newType = existing.type === 'working' ? 'non_working' : 'working'
  await db
    .update(calendarDays)
    .set({
      type: newType,
      reason: newType === 'non_working' ? (reason ?? null) : null,
    })
    .where(eq(calendarDays.id, existing.id))

  revalidatePath(`/projects/${projectId}/calendar`)
}

export async function getBrazilianHolidays(year: number): Promise<{ date: string; reason: string }[]> {
  const easter = getEasterDate(year)

  const holidays: { date: string; reason: string }[] = [
    { date: `${year}-01-01`, reason: 'Confraternização Universal' },
    { date: toDateStr(addDays(easter, -47)), reason: 'Carnaval' },
    { date: toDateStr(addDays(easter, -48)), reason: 'Carnaval' },
    { date: toDateStr(addDays(easter, -2)), reason: 'Sexta-feira Santa' },
    { date: `${year}-04-21`, reason: 'Tiradentes' },
    { date: `${year}-05-01`, reason: 'Dia do Trabalho' },
    { date: toDateStr(addDays(easter, 60)), reason: 'Corpus Christi' },
    { date: `${year}-09-07`, reason: 'Independência do Brasil' },
    { date: `${year}-10-12`, reason: 'Nossa Senhora Aparecida' },
    { date: `${year}-11-02`, reason: 'Finados' },
    { date: `${year}-11-15`, reason: 'Proclamação da República' },
    { date: `${year}-12-25`, reason: 'Natal' },
  ]

  // Deduplicate dates (Carnaval segunda e terça may share same date in edge cases)
  const seen = new Set<string>()
  return holidays.filter((h) => {
    if (seen.has(h.date)) return false
    seen.add(h.date)
    return true
  })
}
