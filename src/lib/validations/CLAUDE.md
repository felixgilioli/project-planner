# Validations

Schemas Zod que servem como fonte única de verdade para regras de negócio.

## Regra

Todo schema definido aqui deve ser usado em **dois lugares**:
1. No Server Action correspondente (`src/app/actions/`) — para validação server-side
2. No componente cliente — via `zodResolver` do React Hook Form

## Arquivos

| Arquivo | Domínio |
|---|---|
| `project.ts` | Criação e edição de projetos |
| `member.ts` | Criação e edição de membros |
| `feature.ts` | Criação e edição de features |
| `activity.ts` | Criação e edição de atividades |

## Padrão de uso no Server Action

```ts
import { projectSchema } from '@/lib/validations/project'

export async function createProject(data: { ... }) {
  projectSchema.parse(data) // lança ZodError se inválido
  // ...resto da action
}
```

## Padrão de uso no cliente

```ts
import { memberSchema, type MemberFormValues } from '@/lib/validations/member'

useForm<MemberFormValues>({
  resolver: zodResolver(memberSchema),
})
```
