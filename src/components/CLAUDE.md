# Components

## Estrutura de pastas

| Pasta | Conteúdo |
|---|---|
| `ui/` | Componentes shadcn/ui — **não editar manualmente** |
| `shared/` | Componentes genéricos sem lógica de negócio (PageHeader, EmptyState, etc.) |
| `projects/` | Componentes de feature: projetos |
| `members/` | Componentes de feature: membros do time |
| `calendar/` | Componentes de feature: calendário de trabalho |

## Adicionar componente shadcn/ui

```bash
npx shadcn@latest add <nome-do-componente>
```

Os arquivos gerados vão para `ui/` automaticamente.

## Componentes de feature vs. shared

- **shared**: sem props específicas de domínio, reutilizáveis em qualquer página
- **feature (projects/, members/, etc.)**: acoplados a um domínio, recebem tipos do schema (`@/lib/db/schema`)

## Padrão de dados

Componentes cliente recebem dados via props (passados pelo Server Component da página).  
Mutações chamam Server Actions diretamente — não há fetch/API calls.  
TanStack Query é usado apenas quando é necessário refetch automático no cliente.
