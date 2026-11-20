# ADR-003: Background jobs on Postgres (pg-boss)

**Status:** Provisional; validate with a spike in Phase 0.

## Context
Webhook processing, notifications (transactional outbox), payment reconciliation, reminders and deadline expiry all need durable retries. The PRD forbids adding Redis/queues without justification.

## Decision
Use **pg-boss** (job queue stored in Postgres) in a worker entrypoint of `apps/api`. No Redis, no Kafka.

## Validation
- It runs against Supabase Postgres through the chosen connection mode.
- Its tables live in a non-exposed schema.
- Retries, scheduling and the dead-letter path all work.

## Fallback
A plain `notification_outbox`/`jobs` table polled by the worker with `FOR UPDATE SKIP LOCKED`.
