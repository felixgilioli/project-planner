import { z } from 'zod'

export const createActivitySchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  startDate: z.date().nullable().optional(),
  dependsOnId: z.string().uuid().nullable().optional(),
  estimatedHours: z.number().min(0).optional(),
  assignedMemberId: z.string().uuid().nullable().optional(),
})

export const updateActivitySchema = createActivitySchema.partial().extend({
  status: z.enum(['backlog', 'in_progress', 'done', 'blocked']).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  displayOrder: z.number().int().optional(),
})

export type CreateActivityValues = z.infer<typeof createActivitySchema>
export type UpdateActivityValues = z.infer<typeof updateActivitySchema>
