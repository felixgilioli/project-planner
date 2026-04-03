# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # Run ESLint
npm run db:push      # Sync Drizzle schema to Supabase (no migrations)
npm run db:studio    # Open Drizzle Studio for DB inspection
npm run db:seed      # Seed database with test data
```

No test runner is configured in this project.

## Environment Setup

Create `.env.local` with these three variables (from Supabase dashboard):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
DATABASE_URL=
```

`DATABASE_URL` must use the Supabase connection pooler URI (transaction mode). Drizzle is configured with `prepare: false` for pooler compatibility.

## Architecture

**Stack**: Next.js 15 (App Router) + TypeScript + Supabase (PostgreSQL + Auth) + Drizzle ORM + Tailwind + shadcn/ui

### Route Groups

- `src/app/(auth)/` — Public routes (login, register)
- `src/app/(app)/` — Protected routes, guarded by `src/middleware.ts`
- `src/app/actions/` — All server mutations as Server Actions (`'use server'`)

All data mutations go through Server Actions — there is no REST API.

### Multi-tenant Data Isolation

Every database query must include a `tenantId` filter. The tenant ID is derived from the authenticated Supabase user (stored in the `users` table). Server Actions always:
1. Get the Supabase session via `src/lib/supabase/server.ts`
2. Look up `tenantId` from the `users` table using the auth user ID
3. Filter all queries by `tenantId`

### Database Schema

Defined in `src/lib/db/schema.ts`. Key relationships:
- `tenants` → `users`, `projects`
- `projects` → `features`, `teamMembers`, `calendars`
- `features` → `activities`
- `activities` → `teamMembers` (via `assignedMemberId`)
- `calendars` → `calendarDays`

Projects are identified in URLs by their `code` field (not UUID), e.g., `/projects/ABC/features`.

### State Management

- **Auth state**: Zustand store (`src/store/auth-store.ts`) synced with Supabase session
- **Server state**: TanStack Query v5 for async/cached data in client components
- **Forms**: React Hook Form + Zod validation throughout
- **Theme**: `next-themes` for light/dark mode

### Data Fetching Pattern

- **Server Components / page.tsx**: Call Server Actions directly (async)
- **Client Components**: Use TanStack Query hooks wrapping Server Actions
- After mutations, call `revalidatePath()` to invalidate Next.js cache

### Supabase Clients

Two separate clients for different contexts:
- `src/lib/supabase/client.ts` — Browser (client components)
- `src/lib/supabase/server.ts` — Server (Server Actions, middleware, server components)
