# Database Layer

Drizzle ORM sobre PostgreSQL via Supabase. Schema centralizado em `schema.ts`, instância em `index.ts`.

## Regras ao modificar o schema

- Toda tabela nova deve ter coluna `tenantId` (UUID, FK para `tenants`) com índice dedicado.
- Índices compostos `(tenantId, <outra_coluna>)` são obrigatórios para as colunas mais consultadas.
- Nomes de índices: `<tabela>_<coluna>_idx` (ex: `features_tenant_idx`).
- Timestamps `createdAt` e `updatedAt` em todas as tabelas.
- Enums são definidos com `pgEnum` e ficam no topo do arquivo.

## Sincronização do schema

Não há migrations — usar `npm run db:push` para sincronizar direto com o Supabase.  
`db:studio` abre o Drizzle Studio para inspeção visual.

## Por que `prepare: false`

O Supabase usa connection pooler (PgBouncer em transaction mode), que não suporta prepared statements. A flag `prepare: false` em `index.ts` é obrigatória.

## Relações-chave

```
tenants → users, projects
projects → features, teamMembers, calendars
features → activities
activities → teamMembers (assignedMemberId, SET NULL on delete)
calendars → calendarDays (CASCADE delete)
features → activities (CASCADE delete)
```

## Soft deletes

`teamMembers` usa `isActive: false` para soft delete (não remover do banco).  
Demais entidades usam hard delete com CASCADE onde necessário.
