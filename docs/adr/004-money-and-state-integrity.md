# ADR-004: Money as integer paise; explicit state machines

**Status:** Accepted

## Decision
- **Amounts:** `bigint` paise with currency `INR`. Percentages are integers; the allowed range is OPEN (OD-03), and the PRD recommends 1–99.
- **Payment split:** computed only on the server.
  - `initial = round_half_up(total × pct / 100)`
  - `remaining = total − verified_initial`
- **Lifecycles** have an explicit transition map in code, a DB `CHECK` on allowed values, and an append-only status-history table. The lifecycles are: demand request, booking, subscription, payment order, occurrence, assignment, ticket, payroll run and salary payment.
- **Immutable records:** booking-term snapshots, provider events, payment transactions, audit events and approved payroll runs. Corrections are separate adjustment records.
- **Idempotency:** an `Idempotency-Key` header is required on POSTs that create money or bookings.
- **Concurrency:** editable configuration and master data carry a `version` column for optimistic concurrency.
