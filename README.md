# Nestovin

A home-services and workforce platform for Maid, Cook and Caretaker services. Five deliverables share one backend:

1. Resident app: React Native + TypeScript + Expo (`apps/resident`)
2. Worker app: React Native + TypeScript + Expo (`apps/employee`)
3. Admin dashboard: Next.js, at `/admin` (`apps/web`)
4. Public website: Next.js, at `/` (`apps/web`, the same app as the admin; ADR-002)
5. Shared backend: Node + Express (`apps/api`)

- **Docs index:** [`docs/README.md`](docs/README.md) says which documents are authoritative.
- **Decisions:** [`docs/adr/`](docs/adr/README.md).

## Layout

```
apps/
  api/            Express modular monolith (shared backend)
  web/            Next.js: Public Website at / (Phase 1b) + Admin Portal at /admin (Milestone 1, functional UI)
  resident/       Resident app (React Native + TS + Expo) - Phase 3
  employee/       Worker app (React Native + TS + Expo)   - Phase 5
packages/
  contracts/      Zod schemas, types, permission catalogue (single source of truth)
supabase/
  migrations/     SQL migrations (schema, privileges, RLS, guards)
```

## Prerequisites

- Node 24 (`.nvmrc`).
- pnpm via corepack, so nothing is installed globally. Run commands as `corepack pnpm <cmd>`, or run `corepack enable` once.
- Docker Desktop (running) for the local Supabase stack.

## First-time setup

```bash
corepack pnpm install
corepack pnpm db:start                       # local Supabase: Postgres, Auth, pooler, Mailpit
cp apps/api/.env.example apps/api/.env       # fill SUPABASE_JWT_SECRET and SUPABASE_SERVICE_ROLE_KEY
corepack pnpm exec supabase status           # prints those values
corepack pnpm --filter @nestovin/api db:setup-local   # local login password for the app_api role
corepack pnpm --filter @nestovin/api bootstrap:super-admin -- --email you@example.com --name "Your Name"
corepack pnpm dev:api
cp apps/web/.env.example apps/web/.env.local       # fill NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY
corepack pnpm dev:web                              # http://localhost:3000 (site) and /admin (proxies /v1 to the API)
```

The invite email arrives in the local Mailpit inbox (URL shown by `supabase status`).

## Checks

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test                                    # unit tests (no database)
corepack pnpm --filter @nestovin/api test:integration # needs local Supabase running
```

## Security model (summary)

- **One unified Admin Portal**, with IAM-style access control:
  - roles are reusable sets of module/action permissions
  - each admin can also get extra grants
  - cluster data scope is set per admin
- **Super Admin is the root account:** only the Super Admin manages admins and roles.
- **MFA (TOTP) is mandatory** for every admin API call.
- **Fresh checks:** permissions, scope and account status are reloaded on every request, so revocation takes effect immediately.
- **Database access:** business tables live in the private `app` schema. Clients never query the database; they only call the API.
- **Row-level security:** an extra layer on sensitive tables only. See ADR-001.
- **Audit log:** append-only.
