import { z } from 'zod'

export const workingDaysSchema = z
  .array(z.number().int().min(0).max(6))
  .min(1, 'Selecione ao menos um dia útil')
