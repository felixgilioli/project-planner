import { z } from 'zod'

export const workingDaysSchema = z
  .array(z.number().int().min(0).max(6))
  .min(1, 'Selecione ao menos um dia útil')

export const calendarEventSchema = z.object({
  type: z.enum(['holiday', 'vacation', 'day_off', 'freeze', 'extra_working']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  memberId: z.string().uuid().nullable(),
  label: z.string(),
})
