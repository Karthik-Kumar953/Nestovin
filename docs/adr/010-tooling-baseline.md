# ADR-010: Tooling baseline

**Status:** Provisional (revisit when a choice causes friction)

| Area | Choice | Why |
|---|---|---|
| Repo | Single monorepo, **plain pnpm workspaces** (no Turborepo) | Owner preference; add build caching only if CI time demands it |
| Package manager | pnpm via Node's corepack (`packageManager` field) | No global installs |
| Language | **TypeScript 6.0.x** (not 7.x yet) | typescript-eslint supports `<6.1`; upgrade when linting supports TS 7 |
| Module resolution | `Bundler` | Workspace packages export TS source; the API is bundled for production |
| API | Express 5 modular monolith | PRD baseline |
| DB access | **Kysely** + `pg`, SQL migrations in `supabase/migrations`, generated types | SQL-first fits RLS/policies/grants written in SQL; explicit transactions for `SET LOCAL` claims |
| Validation / contracts | Zod 4 in `packages/contracts`; OpenAPI generated from it | One source of truth for API + clients |
| Tests | Vitest; Playwright (web/admin E2E); Maestro (mobile) | |
| Local DB | Supabase CLI as a dev dependency (`pnpm db:start`), requires Docker Desktop | |
