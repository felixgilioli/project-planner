# Server Actions

Todas as mutações de dados do app ficam aqui como Server Actions (`'use server'`). Não existe API REST.

## Padrão obrigatório em toda action de escrita

```ts
// 1. Validar input com schema Zod (de src/lib/validations/)
schema.parse(data)

// 2. Obter tenantId autenticado
const tenantId = await getAuthenticatedTenantId()

// 3. Todas as queries incluem filtro por tenantId
.where(and(eq(table.id, id), eq(table.tenantId, tenantId)))

// 4. Invalidar cache após mutação
revalidatePath('/caminho/relevante')
```

## Arquivos

| Arquivo | Domínio |
|---|---|
| `auth.ts` | Login e registro de usuários |
| `projects.ts` | CRUD de projetos |
| `features.ts` | CRUD de features |
| `activities.ts` | CRUD de atividades (inclui cálculo de data estimada) |
| `members.ts` | CRUD de membros do time (soft delete via isActive) |
| `calendar.ts` | Calendário de trabalho e feriados brasileiros |

## Validações

Schemas Zod estão em `src/lib/validations/` — um arquivo por domínio.  
Cada action de escrita importa e chama `schema.parse(data)` antes de qualquer operação no banco.

## getAuthenticatedTenantId

Definido em `src/lib/auth.ts`. Obtém o usuário da sessão Supabase e retorna o `tenantId` da tabela `users`. Redireciona para `/login` se não autenticado.
