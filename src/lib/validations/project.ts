import { z } from 'zod'

export const projectSchema = z.object({
  name: z
    .string()
    .min(1, 'Nome é obrigatório.')
    .max(50, 'Nome pode ter no máximo 50 caracteres.'),
  code: z
    .string()
    .min(1, 'Código é obrigatório.')
    .max(30, 'Código pode ter no máximo 30 caracteres.')
    .regex(/^[a-z0-9-]+$/, 'Somente letras minúsculas, números e traço (-).'),
  description: z
    .string()
    .max(200, 'Descrição pode ter no máximo 200 caracteres.')
    .optional(),
  color: z.string(),
})

export type ProjectFormValues = z.infer<typeof projectSchema>
