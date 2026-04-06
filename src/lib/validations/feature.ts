import { z } from 'zod'

export const featureSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  description: z.string().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  status: z.enum(['backlog', 'in_progress', 'done', 'blocked']).optional(),
  dependsOnId: z.string().uuid().nullable().optional(),
  isBlocked: z.boolean().optional(),
})

export const updateFeatureSchema = featureSchema.partial().extend({
  displayOrder: z.number().int().optional(),
})

export const toggleBlockedSchema = z.object({
  isBlocked: z.boolean(),
  commentContent: z.string().min(1, 'Comentário é obrigatório').max(1000),
})

export type FeatureFormValues = z.infer<typeof featureSchema>
export type ToggleBlockedValues = z.infer<typeof toggleBlockedSchema>
