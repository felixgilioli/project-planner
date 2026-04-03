import { z } from 'zod'

export const memberSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  roleDescription: z.string().optional(),
  dailyCapacityHours: z.number().min(1).max(12),
})

export type MemberFormValues = z.infer<typeof memberSchema>
