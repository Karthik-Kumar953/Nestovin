# ADR-001: Single operating company; access isolation and RLS tiering

**Status:** Accepted (owner, 20 Nov 2026). Proof of concept **passed** on 20 Nov 2026 against the hosted Supabase dev project (Supavisor transaction pooler, port 6543): 9/9 RLS tests and 25/25 database tests green.

## Context
PRD v1.1 §15.3 asks for a "tenant" boundary. Nestovin is one company running one platform; it is not a multi-tenant SaaS.

## Decision
- No tenant tables, tenant IDs or tenant semantics.
- Two separate structures:
  - **Physical:** City → Community → Tower/Building → Flat.
  - **Operational:** Cluster → one or more Communities. A community belongs to exactly one cluster at a time. Moves are recorded in `cluster_community_memberships` with effective dates and a reason; history is never overwritten.
- Access isolation layers:
  1. Module/action permissions (ADR-008), enforced in the backend.
  2. Cluster data scope (per admin), enforced in backend repositories.
  3. Household ownership (residents) and employee ownership (workers), enforced in the backend.
- **Database privileges for every table:** business tables live in the `app` schema, which is not exposed through the Supabase Data API, and `anon`/`authenticated` have no privileges. Clients only call our API.
- **RLS (second wall) only on Tier A tables**, each with a policy and a CI test:
  - resident/household data and documents
  - employee HR data and compensation
  - attendance (location evidence)
  - occurrences and assignments
  - tickets
  - payments and payroll
- Tier B tables (master data, catalogue, config, permission catalogue, audit, outbox, imports, enquiries) rely on backend authorisation + DB privileges. RLS is never enabled on a table without a policy and a test.
- Operational rows store the `cluster_id`/`community_id` that applied at creation.

## Proof of concept (gate before Tier A tables exist)
1. Custom login role `app_api` connects through the Supabase pooler; `SET LOCAL` claims stay inside the transaction and never leak across pooled connections.
2. Two policies proved by tests: ownership on `resident_profiles`, cluster scope on `support_tickets`. A missing claim must deny everything.
3. `anon`/`authenticated` cannot reach `app.*`.
4. Storage signing works with the service role confined to one adapter.
5. Claim-setup overhead is negligible.

Fallbacks:
- If the pooler blocks the approach, use a session/direct connection.
- If RLS is unworkable, drop it and rely on backend authZ + privileges + mandatory per-route scope tests.

## Consequences
Simpler schema and queries. If a second operator ever appears, adding an organisation boundary is a planned migration.
