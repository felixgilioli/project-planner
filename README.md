# SquadPlanner

Plataforma SaaS para planejamento de squads em times ágeis.

## Stack

- **Next.js 15** (App Router) + TypeScript
- **Tailwind CSS** + shadcn/ui
- **Supabase** (Auth + PostgreSQL)
- **Drizzle ORM**
- **Zustand**
- **TanStack Query v5**

## Como rodar localmente

### 1. Criar projeto no Supabase

Acesse [supabase.com](https://supabase.com) e crie um novo projeto. Anote a URL do projeto e a chave anônima (anon key).

### 2. Configurar variáveis de ambiente

```bash
cp .env.local.example .env.local
```

Preencha as variáveis no arquivo `.env.local`:

| Variável | Onde encontrar |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public |
| `DATABASE_URL` | Supabase → Settings → Database → Connection string (URI) |

### 3. Instalar dependências

```bash
npm install
```

### 4. Aplicar o schema no banco de dados

```bash
npx drizzle-kit push
```

### 5. Iniciar o servidor de desenvolvimento

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

## Scripts disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia o servidor de desenvolvimento |
| `npm run build` | Gera o build de produção |
| `npm run db:push` | Aplica o schema no banco (sem migrations) |
| `npm run db:studio` | Abre o Drizzle Studio para inspecionar o banco |

## Estrutura do projeto

```
src/
├── app/
│   ├── (auth)/          # Rotas públicas: login, register
│   ├── (app)/           # Rotas protegidas: projects, ...
│   ├── layout.tsx
│   └── page.tsx         # Redirect para /projects
├── components/
│   ├── ui/              # Componentes shadcn/ui
│   └── shared/          # Componentes compartilhados
├── lib/
│   ├── supabase/        # Clientes browser e server
│   ├── db/              # Schema Drizzle e instância do db
│   └── utils.ts
├── hooks/               # Custom hooks
├── store/               # Zustand stores
└── types/               # Tipos TypeScript globais
```
