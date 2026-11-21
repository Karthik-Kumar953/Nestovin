# Nestovin system review: data model, security, API and system design

**Date:** 21 Nov 2026
**Reviewer:** architecture review session (read-only for code), using `.claude/skills/database-architect/SKILL.md`
**Scope:** all 30 migrations in `supabase/migrations` (`20261120000100` … `20261129000800`), `apps/api/src/**`
(every module, the job runner, integrations and auth), checked against `docs/Architecture/data-model.md`,
ADR-001 … ADR-017 and the workflows document.
**Not done:** no queries were run against the dev database, so the index notes below are reasoned from
query shapes, not from `EXPLAIN` output. No code or migration was changed.

The ER diagram of the real schema is in [`erd.md`](erd.md).

## Summary

| Severity | Count | What it means here |
|---|---|---|
| Critical | 0 | — |
| High | 6 | Will happen in normal operation, or loses money/state when it does |
| Medium | 14 | Defence-in-depth gaps, races with narrow windows, operability, API gaps |
| Low | 9 | Polish with a concrete but small failure |

The foundations are strong. Money is integer paise with a CHECK on every amount, snapshots are immutable by
trigger, provider payment ids are unique, there's a no-double-booking exclusion constraint, and every Tier A
table has RLS whose missing-claim case denies. The serious problems are not in the primitives. They sit in
four places:
- the **seams between transactions**: webhook acknowledgement, the job lease, and the outbox worker
- the **one-time copy of `cluster_id`**, which goes stale when a community moves cluster
- **idempotency**, which ADR-004 promises and the code leaves optional
- **RLS write policies** that check ownership but not state, so an owner may change approval columns

### Top five, in fix order
1. **H-1:** moving a community to another cluster leaves its residents, and every new booking, ticket and visit, scoped to the old cluster.
2. **H-2:** a verified payment is rolled back, with no record and no exception, when its business effect throws.
3. **H-3:** webhook events that fail or crash mid-processing are acknowledged and never retried, and refunds have no reconciliation path.
4. **H-4:** `Idempotency-Key` is optional and not replay-safe, so a retried booking or renewal POST creates a second payable booking.
5. **H-5:** the job lease (55 s) is shorter than a worst-case tick, the outbox has no per-row claim, and one failing job starves the others. Under load this sends duplicate notifications.

---

## High

### H-1 Cluster moves leave operational scope stale; new rows are stamped with the old cluster

**Evidence**
- `apps/api/src/modules/locations/service.ts:440-483`: `assignCluster` closes and opens `cluster_community_memberships` and changes nothing else.
- `supabase/migrations/20261122000100_residents_and_support.sql:57-74`: `tg_membership_scope` copies `cluster_id` onto a membership **once**, at insert.
- Every resident write copies the membership's frozen value rather than the community's current cluster:
  - `apps/api/src/modules/bookings/resident-service.ts:36-45` (`household()` returns `m.cluster_id`), used by demand requests, bookings, renewals, snapshots and payment orders
  - `apps/api/src/modules/support/service.ts:147` (tickets)
  - `apps/api/src/modules/residents/resident-service.ts:199-225` (documents, verification requests)
  - `apps/api/src/modules/bookings/payments.ts:272,288` (subscriptions and components copy the booking's value)
- RLS uses that column for admin scope: `app.claim_is_admin_in(cluster_id)` in every Tier A policy.
- Allocation uses it for eligibility: `apps/api/src/modules/workforce/allocation.ts:93,373` (`home_cluster_id !== c.clusterId` → "Outside the authorised cluster").

**Failure scenario**
1. Community X sits in cluster A. Residents register and get verified; their memberships carry `cluster_id = A`.
2. A Super Admin moves X to cluster B (`POST /v1/admin/communities/:id/cluster`).
3. Tomorrow a resident of X books a service and raises a ticket. Both rows are stamped `A`, because they copy `residence_memberships.cluster_id`.
4. As a result:
   - **Cluster-B admins** see none of X's residents, tickets, payments or visits. RLS filters them out, and the backend scope check returns 404.
   - **Cluster-A admins**, who are no longer responsible for X, keep reading the residents' names, phones, documents and tickets, including rows created after the move.
   - **Cluster-B workers** fail the cluster eligibility check, so the new subscription can never be staffed and stays `PENDING_ACTIVATION`.
   - **Escalation** goes to cluster A's admins (`support/escalation.ts:63-65` uses the ticket's cluster).

ADR-001 says operational rows store the cluster "that applied **at creation**". Rows created after the move break
that rule. Active, still-open rows (memberships, open tickets, live subscriptions, future visits) also have to
follow the community. Otherwise the new cluster cannot operate them at all.

**Fix** (forward-only migration plus a service change)

```sql
-- 1. One source of truth for "the community's cluster now".
create or replace function app.current_cluster_of(p_community uuid) returns uuid
language sql stable security definer set search_path = ''
as $$ select m.cluster_id from app.cluster_community_memberships m
       where m.community_id = p_community and m.effective_to is null $$;
revoke all on function app.current_cluster_of(uuid) from public;
grant execute on function app.current_cluster_of(uuid) to app_api, app_worker;

-- 2. Stamp cluster_id from the community on INSERT for every Tier A table that has
--    community_id (memberships already do this; extend it to the rest).
create or replace function app.tg_scope_from_community() returns trigger
language plpgsql as $$
begin
  new.cluster_id := app.current_cluster_of(new.community_id);
  return new;
end $$;
-- repeat for: booking_terms_snapshots, demand_requests, bookings, subscriptions,
-- payment_orders, support_tickets (when community_id is not null), documents,
-- residence_verification_requests, family_access_requests, resident_change_requests,
-- service_occurrences
create trigger bookings_scope before insert on app.bookings
  for each row execute function app.tg_scope_from_community();

-- 3. Re-scope OPEN work when a community moves; history keeps its original cluster.
create or replace function app.move_community_scope(p_community uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_new uuid := app.current_cluster_of(p_community);
begin
  if app.claim_actor_kind() is distinct from 'admin' or not app.claim_has_cluster(v_new) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update app.residence_memberships set cluster_id = v_new
   where community_id = p_community and status in ('PENDING', 'VERIFIED');
  update app.residence_verification_requests set cluster_id = v_new
   where community_id = p_community and decision = 'PENDING';
  update app.family_access_requests set cluster_id = v_new
   where community_id = p_community and status = 'PENDING';
  update app.resident_change_requests set cluster_id = v_new
   where community_id = p_community and status = 'PENDING';
  update app.support_tickets set cluster_id = v_new
   where community_id = p_community and status not in ('RESOLVED', 'CLOSED');
  update app.subscriptions set cluster_id = v_new
   where community_id = p_community and status in ('PENDING_ACTIVATION', 'ACTIVE');
  update app.subscription_components c set cluster_id = v_new
    from app.subscriptions s
   where s.id = c.subscription_id and s.community_id = p_community
     and s.status in ('PENDING_ACTIVATION', 'ACTIVE');
  update app.service_occurrences set cluster_id = v_new
   where community_id = p_community and scheduled_date >= (now() at time zone 'Asia/Kolkata')::date
     and status in ('SCHEDULED', 'ASSIGNED');
  -- standing/occurrence assignments of the moved community are ended by the service
  -- (workers of the old cluster are no longer eligible); see the code change below.
end $$;
revoke all on function app.move_community_scope(uuid) from public;
grant execute on function app.move_community_scope(uuid) to app_api;
```

**Code change**
- `assignCluster` calls `select app.move_community_scope($1)` after inserting the new membership.
- In the same transaction it refuses the move while the community has ACTIVE standing assignments (the same guard as `workforce/admin-service.ts:257-261`). Alternatively it ends those assignments and lists them for re-allocation.
- `household()` keeps returning `m.cluster_id`. That is correct once step 3 has run.

**Test** (`apps/api/test/db/cluster-move.test.ts`)
1. Seed community X in cluster A with a verified resident, an open ticket and a closed ticket.
2. Move X to B as a global admin.
3. Assert that:
   - a cluster-B admin sees the membership and the open ticket
   - a cluster-A-only admin sees neither
   - the closed ticket still has `cluster_id = A`
   - a booking created after the move has `cluster_id = B`

### H-2 A verified payment is rolled back, with no record and no exception, if its business effect throws

**Evidence**
- `apps/api/src/modules/bookings/payments.ts:141-193`: `settle` runs one transaction. It inserts the `payment_transactions` row (147-161), then calls `applyPurpose` → `createSubscription` (181, 254, 260-299).
  - Any exception in that tail rolls back the transaction row too.
  - The webhook path catches it, stores `processing_error` and still answers 200 (`payments.ts:335-341`).
  - Reconciliation retries `settle` every minute for three days and logs a warning each time (`payments.ts:445-455`). Then it stops.
- A deterministic throw that is reachable in normal use:
  - `subscriptions_one_renewal` is a unique index (`20261123000100_demand_booking_payments.sql:251`).
  - `renew()` checks for an existing renewal **without a lock** (`resident-service.ts:423-429`).
  - Two renewals started together, by a double tap or two family members, create two bookings and two orders. When both are paid, the second `createSubscription` raises 23505 on every retry.
- Other throwing calls inside the tail: `executeTakeFirstOrThrow` on the slot (`payments.ts:228`) and the snapshot (`payments.ts:265`).

**Failure scenario**
1. Resident and spouse both tap "Renew" on the same subscription.
2. Both pay. Payment 1 settles and creates the renewal subscription.
3. Payment 2 is captured at Razorpay, but `settle` throws on the unique index. No `payment_transactions` row, no `payment_exceptions` row, and the order stays `CREATED`.
4. After three days reconciliation stops looking. ₹X sits captured with no trace in ADM-08 and no refund prompt.

**Fix**
- Record the evidence first, then apply the purpose inside a savepoint. Any failure turns into REVIEW_REQUIRED instead of a rollback:

```ts
// payments.ts, inside settle() after the payment_transactions insert
let outcome: { reason: PaymentExceptionReason; detail: string } | null;
try {
  outcome = await trx.transaction().execute((sp) =>   // Kysely nested tx = SAVEPOINT
    this.applyPurpose(sp, order.purpose, order.ref_type, order.ref_id, payment.amountPaise));
} catch (err) {
  this.logger.error({ err, orderId: order.id }, 'payment effect failed; sent to review');
  outcome = { reason: 'RECORD_NOT_PAYABLE', detail: `Could not apply payment: ${String((err as Error).message).slice(0, 200)}` };
}
if (outcome) return review(outcome.reason, outcome.detail);
```

  If the installed Kysely version has no nested transactions, use `sql\`savepoint apply_purpose\`` and `rollback to savepoint` explicitly.
- Close the renewal race at the source:
  - lock the subscription in `renew()`: `.forUpdate('s')` on the select at `resident-service.ts:413-420`
  - add `create unique index bookings_one_live_renewal on app.bookings (renews_subscription_id) where renews_subscription_id is not null and status in ('PENDING_PAYMENT', 'CONFIRMED', 'REVIEW_REQUIRED');`

**Test**
- `payments.test.ts`: settle two captured payments for two renewal bookings of the same subscription. Expect two `payment_transactions` rows, one `CONFIRMED` booking, one `payment_exceptions` row, and the second order `REVIEW_REQUIRED`.
- A second test calls `renew()` twice concurrently and expects one `CONFLICT`.

### H-3 Webhook events are acknowledged even when processing fails, and are never retried; refunds have no reconciliation

**Evidence**
- `apps/api/src/modules/bookings/payments.ts:316-341`:
  - the raw event is inserted with `ON CONFLICT (event_id) DO NOTHING` in one transaction
  - processing runs in later transactions
  - on error the code stores `processing_error` and still returns `'ok'`, so the route answers 200 (`routes.ts:195-199`)
- When Razorpay retries (or the process crashed between insert and processing), the insert conflicts and the code returns `'duplicate'` without processing.
- No job reads `provider_events where processed_at is null`.
- Reconciliation covers only orders, only for three days (`payments.ts:434-444`). `refund.processed` (`payments.ts:362-366, 371-422`) has no fallback at all.

**Failure scenario**
1. A `refund.processed` webhook arrives during a database blip (pool timeout, failover).
2. `recordRefund` throws, `processing_error` is saved, and Razorpay gets 200.
3. The approved `refund_records` row stays `APPROVED` forever, `payment_transactions.status` stays `CAPTURED`, and the revenue summary (verified payments minus refunds) overstates revenue.
4. Nothing in the admin UI shows the gap.

The same happens to any `payment.captured` whose order is older than three days.

**Fix**

```sql
-- Let a retry re-claim an unprocessed event instead of being treated as a duplicate.
alter table app.provider_events add column attempts integer not null default 0;
create index provider_events_unprocessed_idx on app.provider_events (received_at)
  where processed_at is null and signature_valid;
```

Code changes:
1. In `handleWebhook`, replace the insert with:

   ```sql
   insert ... on conflict (event_id) do update set attempts = provider_events.attempts + 1
     where provider_events.processed_at is null and provider_events.signature_valid
   returning id, processed_at
   ```

   Process when a row comes back.
2. Return **500** (not 200) when processing throws, so Razorpay retries.
3. Add a `reprocessEvents()` job step. It re-runs `processEvent` for valid, unprocessed events older than 2 minutes and younger than 7 days (limit 50) and gives up into `payment_exceptions` after N attempts.
4. Add `refund.processed` reconciliation: for `refund_records` that stay `APPROVED` more than 24 h, call `GET /payments/:id/refunds` and link what is there.

**Test**
- Make `recordRefund` throw once. Assert the HTTP status is 500 and `processed_at` is null.
- Replay the same event. Assert it is processed and the refund is `PROCESSED`.
- Run `reprocessEvents()` on a seeded unprocessed event and assert it gets processed.

### H-4 Money POSTs are not idempotent: `Idempotency-Key` is optional and a replay is an error, not the original response

**Evidence**
- ADR-004: "an `Idempotency-Key` header is **required** on POSTs that create money or bookings".
- `data-model.md` §16 designs an `idempotency_keys` table. No migration creates it.
- `apps/api/src/modules/bookings/routes.ts:31-34`: a missing or malformed key becomes `undefined`.
- `payments.ts:86`: a random UUID is used instead.
- `payments.ts:91-93`: a replayed key raises a 23505 → "already submitted" error instead of returning the first checkout.
- Booking creation has no duplicate guard:
  - `resident-service.ts:324-358` inserts a snapshot plus a booking every time
  - no index limits live bookings per flat or per renewed subscription (`20261123000100_demand_booking_payments.sql:203-230`)

**Failure scenario**
1. On a weak mobile connection, the resident taps "Book".
2. The request reaches the API, which creates booking B1 and order O1, but the response is lost.
3. The app retries without a key (the key is optional), and B2 and O2 are created.
4. The resident pays O2. B1 stays `PENDING_PAYMENT` and appears in the resident's booking list as an unpaid duplicate until its start date passes.
5. If the resident also completes O1 from a "Pay now" button on B1, both bookings confirm and two subscriptions run for one flat:
   - double charge
   - two capacity units
   - two sets of visits generated

With the key sent, the retry gets a `VALIDATION`/`CONFLICT`-style error. The app then has no checkout to show for a booking that exists.

**Fix**

```sql
create table app.idempotency_keys (
  actor_kind   text not null,
  actor_id     uuid not null,
  key          text not null check (key ~ '^[A-Za-z0-9_-]{8,100}$'),
  route        text not null,
  request_hash text not null,
  status_code  integer,
  response     jsonb,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '24 hours',
  primary key (actor_kind, actor_id, key)
);
create index idempotency_keys_expiry_idx on app.idempotency_keys (expires_at);
grant select, insert, update, delete on app.idempotency_keys to app_api;  -- delete for retention job
```

Code changes:
1. Add `requireIdempotency(route)` middleware on:
   - `POST /resident/demand-requests`
   - `POST /resident/bookings`
   - `POST /resident/subscriptions/:id/renew`
   - `POST /resident/*/pay`
   - `POST /resident/payments/verify`
   - admin `refunds`
   - payroll `payments`
2. The middleware behaves as follows:
   - **No key:** answer 400.
   - **New key:** insert the key row, run the handler, store the response.
   - **Same key and hash:** replay the stored response.
   - **Same key, different hash:** answer 422.
   - **Key still in flight:** answer 409.
3. Add `bookings_one_live_renewal` (from H-2).

**Test**
- Send `POST /resident/bookings` twice with the same key. Expect the same `bookingId` and `paymentOrderId`, and one row in `bookings`.
- Send it without a key and expect 400.

### H-5 Job runner: the lease is shorter than a worst-case tick, the outbox has no row claim, and one failing job starves the rest

**Evidence**
- `apps/api/src/jobs/runner.ts:32`: lease = `intervalMs/1000 - 5` = **55 s**. It is never extended.
- One tick runs, in order:
  - reconciliation: up to 50 orders, each a Razorpay call with a 15 s timeout (`payments.ts:434-455`, `integrations/razorpay.ts:57`)
  - maintenance
  - occurrence generation plus up to 500 auto-assignments (`allocation.ts:430-468`)
  - escalation
  - outbox delivery: 50 rows, each up to 15 s (`messaging.ts`)
- `runner.ts:43`: one `try/catch` around all of these steps, so a throw in `payments.maintenance()` skips escalation and notifications for that tick, and for every later tick while the throw persists.
- `apps/api/src/modules/notifications/service.ts:105-151`: the worker selects due rows without a claim (`FOR UPDATE SKIP LOCKED` or a status move) and delivers them outside any lock.

**Failure scenario**
1. With two API instances, Razorpay latency spikes and reconciliation takes about 4 minutes.
2. At 55 s, instance 2 claims the lease and starts its own tick.
3. Both instances reach `processOutbox` and select the same `PENDING` rows.
4. Residents get every push and email twice. A multi-device push that fails half way is resent to all devices on retry.
5. Separately, a single bad row that makes `maintenance()` throw (for example the H-2 constraint error in another path) stops all notification delivery and ticket escalation until someone reads the logs.

**Fix**
1. **Per-job isolation:** wrap each step in its own `try/catch` with a job name in the log.
2. **Lease:** claim a generous lease (for example 10 minutes) and release it at the end of the tick (`update ... set value = to_jsonb(now()::text)`). Alternatively renew it between steps.
3. **Outbox claim:**

   ```sql
   alter table app.notification_outbox add column locked_until timestamptz;
   ```

   Then claim rows with:

   ```sql
   update app.notification_outbox o set locked_until = now() + interval '5 minutes'
    where o.id in (select id from app.notification_outbox
                    where status = 'PENDING' and next_attempt_at <= now()
                      and (locked_until is null or locked_until < now())
                    order by next_attempt_at limit 50
                    for update skip locked)
   returning o.*;
   ```

4. **Provider idempotency:** pass `Idempotency-Key: <outbox id>` to Resend. For FCM, send per token and record which tokens succeeded.

**Test**
- Run `processOutbox()` twice concurrently on 10 seeded rows with a fake sender that counts calls. Expect exactly 10 sends.
- Make `payments.maintenance` throw and assert `processOutbox` still ran.

### H-6 Business "today" is computed in UTC; ADR-015's no-same-day rule and date guards break from 00:00 to 05:30 IST

**Evidence**
`new Date().toISOString().slice(0, 10)` (a UTC date) is used as the business date in many places:
- `apps/api/src/modules/bookings/resident-service.ts:22` (booking window)
- `bookings/pricing.ts:22` (`addDays`)
- `bookings/payments.ts:505` (subscription end, booking lapse)
- `workforce/allocation.ts:12` (auto-assign horizon)
- `workforce/employee-service.ts:174` (leave)
- `payroll/service.ts:168,430,464`
- `residents/change-requests.ts:87`
- `workforce/admin-service.ts:275` (`exited_on`)
- `overview/routes.ts:22`, `attendance/routes.ts:35,72`, `workforce/routes.ts:70,205`

`generateOccurrences` uses Postgres `current_date` (UTC on Supabase, `allocation.ts:487`). Only attendance uses the community timezone (`attendance/service.ts:43`).

**Failure scenario**
At 01:00 IST on 22 Nov, `today()` is `2026-11-21`, so "tomorrow" is the 22nd:
- **Same-day booking:** the resident books a continuous plan starting **today**, which ADR-015 forbids. The visit is generated for that day with no worker assigned.
- **Leave:** an employee files leave starting yesterday.
- **Exit date:** an employee exited at 02:00 IST gets `exited_on` = the previous day, so payroll prorates one day short.
- **Subscription end:** subscriptions end 5.5 h late.

**Fix**
- Add one helper, `businessToday(tz = 'Asia/Kolkata')`, using `Intl.DateTimeFormat('en-CA', { timeZone })` (the attendance module already has it), and use it everywhere.
- In SQL, replace `current_date` with `(now() at time zone 'Asia/Kolkata')::date`. Per community, use `co.timezone`.
- Add an ESLint `no-restricted-syntax` rule banning `toISOString().slice(0, 10)` outside the helper.

**Test**
With fake timers at `2026-11-21T20:00:00Z` (01:30 IST on the 22nd), `createBooking` with `startDate = '2026-11-22'` must be refused, and `businessToday()` must return `2026-11-22`.

---

## Medium

### M-1 Tier A write policies check ownership, not state, so owners may change approval columns

**Evidence** (`USING` and `WITH CHECK` accept the owner; grants are table-wide `UPDATE`)
- `attendance_corrections`: an employee can update their own correction to `status = 'APPROVED'` (`20261125000100_attendance.sql:155-158,169`).
- `leave_requests`: an employee can set their own leave to `APPROVED` (`20261124000100_workforce_allocation.sql:249-252,289`).
- `employees`: an employee can change their own `home_cluster_id`, `status`, `readiness` and `sessions_valid_after` (`:229-232,289`).
- `attendance_events`: an employee can set `review_status = 'ACCEPTED'` on their own flagged event, because the guard trigger allows review fields (`20261125000100_attendance.sql:61-77,139-141`).
- `attendance_events`, `service_completions`, `no_show_records`: an employee may **insert** rows for any occurrence. The check is `claim_is_employee(employee_id)`, not "assigned to this occurrence" (`:139-153`).
- `service_occurrences`: the assigned employee may update any column (`flat_id`, `scheduled_date`, `cluster_id`) (`20261129000400_overtime_visit_visibility.sql:15-20`).
- `residence_memberships`: a resident may update their own membership to `VERIFIED`. A family member may update the Primary's row on the same flat (`20261122000100_residents_and_support.sql:258-266`).

**Failure scenario**
RLS is the second wall (ADR-001), so it should hold when the first wall has a bug. Suppose an employee route passes a client field through to `.set(...)`; the leave and correction PATCH routes are the likely candidates. A worker can then approve their own leave or attendance correction, which feeds payroll flags and paid days. Today the only protection is the service code.

**Fix**
Add a guard trigger per table that forbids non-admin actors from changing decision columns, plus column-level grants where possible:

```sql
create or replace function app.tg_owner_cannot_decide() returns trigger
language plpgsql as $$
begin
  if app.claim_actor_kind() in ('employee', 'resident') then
    if tg_table_name in ('leave_requests', 'attendance_corrections') and new.status is distinct from old.status
       and new.status not in ('PENDING', 'CANCELLED') then
      raise exception 'Only an admin can decide this request' using errcode = '42501';
    end if;
    if tg_table_name = 'attendance_events' and new.review_status is distinct from old.review_status then
      raise exception 'Only an admin can review attendance' using errcode = '42501';
    end if;
    if tg_table_name = 'residence_memberships'
       and (new.status is distinct from old.status and new.status = 'VERIFIED'
            or new.flat_id is distinct from old.flat_id or new.kind is distinct from old.kind) then
      raise exception 'Residents cannot verify or move memberships' using errcode = '42501';
    end if;
    if tg_table_name = 'employees'
       and (new.home_cluster_id, new.status, new.readiness, new.sessions_valid_after, new.login_enabled_at)
           is distinct from (old.home_cluster_id, old.status, old.readiness, old.sessions_valid_after, old.login_enabled_at) then
      raise exception 'Employees cannot change HR fields' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger leave_requests_owner_guard before update on app.leave_requests for each row execute function app.tg_owner_cannot_decide();
-- same for attendance_corrections, attendance_events, residence_memberships, employees

-- Employee inserts only for their own assigned visits:
drop policy attendance_events_access on app.attendance_events;
create policy attendance_events_access on app.attendance_events
  using (app.claim_is_employee(employee_id) or app.claim_is_admin_in(cluster_id) or app.claim_is_system())
  with check ((app.claim_is_employee(employee_id) and occurrence_id = any ((select app.claim_employee_occurrence_ids())))
              or app.claim_is_admin_in(cluster_id) or app.claim_is_system());
-- same shape for service_completions and no_show_records (employee branch)
```

**Test** (`apps/api/test/db/rls-owner-guards.test.ts`)
For each table, with employee or resident claims, attempt the forbidden update directly and expect `42501`. Also expect an employee insert into `attendance_events` for an unassigned occurrence to fail.

### M-2 "Append-only" and "immutable once approved" are not enforced for three money records

**Evidence**
- **`payment_transactions`:** only DELETE is blocked (`20261123000100_demand_booking_payments.sql:371-372`). `app_api` has table-wide UPDATE (`:450`), so `amount_paise`, `provider_payment_id` and `order_id` are writable.
- **`provider_events`:** UPDATE on all columns (`:449`), including `payload` and `signature_valid`.
- **Approved payroll:** `payroll_lines` and `payroll_line_items` have UPDATE and **DELETE** (`20261127000100_payroll_finance.sql:154`). No trigger freezes lines of an `APPROVED` run. ADR-004 and data-model §15 say "approved runs are read-only".

**Failure scenario**
A future admin "fix amount" feature, or a bug in `recalcLine`, rewrites `net_paise` of an approved, partly paid line. The overpayment guard (`payroll/service.ts:431-432`) then compares against a number that no longer matches what was approved. Bank reconciliation breaks silently, and there is no history.

**Fix**

```sql
revoke update on app.payment_transactions from app_api;
grant update (status) on app.payment_transactions to app_api;
revoke update on app.provider_events from app_api;
grant update (processed_at, processing_error) on app.provider_events to app_api;  -- + attempts (H-3)

create or replace function app.tg_payroll_frozen_after_approval() returns trigger
language plpgsql as $$
declare v_status text;
begin
  select r.status into v_status from app.payroll_runs r
   where r.id = coalesce(
     (case when tg_table_name = 'payroll_lines' then coalesce(new.run_id, old.run_id) end),
     (select l.run_id from app.payroll_lines l where l.id = coalesce(new.line_id, old.line_id)));
  if v_status in ('APPROVED', 'IN_REVIEW') then
    raise exception 'Cannot change a payroll run that is % ', lower(v_status) using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end $$;
create trigger payroll_lines_frozen before insert or update or delete on app.payroll_lines
  for each row execute function app.tg_payroll_frozen_after_approval();
create trigger payroll_line_items_frozen before insert or update or delete on app.payroll_line_items
  for each row execute function app.tg_payroll_frozen_after_approval();
-- payroll_runs: APPROVED -> no further status change (RETURNED / back to DRAFT)
```

**Test**
- `update app.payment_transactions set amount_paise = 1` as `app_api` → `42501`.
- Delete a line of an approved run → `check_violation`.

### M-3 The balance-expiry job can overwrite CONVERTED with EXPIRED

**Evidence**
`apps/api/src/modules/bookings/payments.ts:482-495`. The overdue list is read, then each request is updated with `where id = r.id` and **no status predicate**. A concurrent `settle` that started just before the deadline commits `CONVERTED` and a `CONFIRMED` booking (`:238-253`). The job's UPDATE waits on the row lock, re-checks only `id`, and writes `EXPIRED`.

**Failure scenario**
1. A balance payment is verified at 23:59:59.
2. The tick at 00:00:01 had already selected the request.
3. The request ends `EXPIRED` ("initial retained"), while the booking is `CONFIRMED` and the subscription exists.
4. ADM-08 shows a forfeited customer who is actually being served, and the audit trail contradicts itself.

**Fix**
Add `.where('status', '=', 'BALANCE_DUE')` to the update and skip the booking update and audit when `numUpdatedRows === 0n`. The same applies to the subscription-end update (`:506-512`); it already has a status predicate and is fine.

**Test**
Hold a `settle` transaction open, run `maintenance()` with `now` after the deadline, commit the settle, and assert the request is `CONVERTED`.

### M-4 A Razorpay HTTP call runs inside the booking database transaction

**Evidence**
- `payments.ts:96-107`: `provider.createOrder` (15 s timeout) runs inside the caller's `withTx`.
- It is called from `createDemandRequest`, `createBooking`, `renew` and `payAgain` (`resident-service.ts:205-217, 350-353, 477-480, 237-259`).
- The transaction holds:
  - a pooled connection (pool `max: 10`, `db/database.ts:31`)
  - the unique-index entry on `demand_requests`

**Failure scenario**
1. Razorpay's order API slows to 10 s during a sale.
2. Ten residents checking out at once hold all ten connections.
3. Every other request, including `/ready`, waits for `connectionTimeoutMillis` (5 s) and fails. The whole API returns 500s for as long as Razorpay is slow.

**Fix**
Split checkout into two transactions:
1. Insert the order with `provider_order_id = null` and commit.
2. Call Razorpay.
3. Update `provider_order_id` in a short second transaction.
4. If the call fails, mark the order `FAILED`.

`orderFor` already tolerates a null `provider_order_id` when it reuses open orders (`:71`).

**Test**
Use a fake provider that sleeps 2 s, fire 12 parallel `createBooking` calls with pool size 10, and assert `/ready` still answers within 1 s.

### M-5 The webhook endpoint accepts unbounded unauthenticated writes, and invalid events occupy the dedupe key

**Evidence**
- `routes.ts:193-199`: no rate limit.
- `payments.ts:316-327`: every request, valid signature or not, inserts a row of up to 256 KB into `provider_events`, keyed by the attacker-supplied `x-razorpay-event-id`.
- Invalid rows are never cleaned up.

**Failure scenario**
- A script posts 1,000 requests a second of 256 KB junk. The table grows by about 900 GB a day. Disk fills and the database goes read-only.
- A forged event can also pre-occupy an event id. Razorpay ids are random, so this is low probability, but the dedupe should not trust unverified rows.

**Fix**
- Do not insert when the signature is invalid. Log a counter and a hash of the body instead, or insert into a capped `provider_events_rejected` table with a 7-day retention.
- Add `rateLimit({ name: 'webhook', limit: 600, windowSeconds: 60, keyFn: ip })`.

**Test**
An unsigned POST returns 400 and `provider_events` row count is unchanged.

### M-6 RLS helper functions are called per row (not wrapped in `select`)

**Evidence**
Policies call `app.claim_household_flat_ids()`, `app.claim_employee_occurrence_ids()` and `app.claim_employee_offered_occurrence_ids()`. These are STABLE SECURITY DEFINER functions, so they cannot be inlined, and each runs a query. They appear directly in `= any (...)`:
- `20261122000100_residents_and_support.sql:247-266,288-292`
- `20261123000100_demand_booking_payments.sql:383-421`
- `20261129000400_overtime_visit_visibility.sql:15-20`
- `20261125000100_attendance.sql:133-163`

Unwrapped, Postgres evaluates them for every candidate row that reaches that OR branch. Supabase's RLS performance guidance is to write `(select fn())` so that it becomes a once-per-statement InitPlan.

**Failure scenario**
A worker opens "My visits". The query on `service_occurrences` reaches the employee branch for every candidate row, so `claim_employee_occurrence_ids()` (an aggregate over `occurrence_assignments`) runs once per row. At 50k occurrences a month, admin list scans reach the same branches for out-of-scope rows, and latency grows linearly with table size.

**Fix**
Recreate each policy with the helpers wrapped:

```sql
drop policy service_occurrences_access on app.service_occurrences;
create policy service_occurrences_access on app.service_occurrences
  using (app.claim_is_admin_in(cluster_id) or app.claim_is_system()
         or (app.claim_actor_kind() = 'resident' and flat_id = any ((select app.claim_household_flat_ids())))
         or id = any ((select app.claim_employee_occurrence_ids()))
         or id = any ((select app.claim_employee_offered_occurrence_ids())))
  with check (app.claim_is_admin_in(cluster_id) or app.claim_is_system()
              or id = any ((select app.claim_employee_occurrence_ids())));
-- same for every policy that calls claim_household_flat_ids() / claim_employee_*_ids()
```

**Test**
- An `EXPLAIN (ANALYZE)` test under employee claims on 10k seeded occurrences asserts an `InitPlan` node and fewer than 5 function calls (`pg_stat_user_functions` delta).
- Keep the existing RLS tests green to prove the semantics did not change.

### M-7 No retention for high-churn tables

**Evidence**
Nothing deletes from any of these:
- `rate_limit_buckets`: one row per key per window, `20261120000500_enquiries_outbox_ratelimit.sql:47-52`
- `notification_outbox` and `notifications`
- `provider_events`
- `import_rows`: the raw JSON of every uploaded workbook row, up to 20k per batch

`grep -rn deleteFrom apps/api/src` shows only device tokens and draft children.

**Failure scenario**
OTP and checkout rate limiting keys on IP and user. With 10k residents, `rate_limit_buckets` grows by millions of rows a month, and every `rate_limit_hit` upsert slows as the primary-key index bloats. The outbox poll index stays small (it is partial), but the table and TOAST keep growing.

**Fix**
Add a daily `retention` job step:
- `delete from app.rate_limit_buckets where window_start < now() - interval '1 day'`
- outbox rows in `SENT/SKIPPED/DEAD` older than 90 days
- `idempotency_keys` past `expires_at`
- `import_rows` of `COMMITTED/REJECTED/CANCELLED` batches older than 180 days (the frozen-rows trigger needs an exemption for the system actor)

Grant `delete` on those tables to the job role only.

**Test**
Seed old rows, run `retention()`, and assert they are gone and recent rows remain.

### M-8 Designed invariants that were never built

`data-model.md` and ADR-004 promise the following. None of them exists in the migrations, and the code does not compensate.

| Promise | Where | Built? | Consequence |
|---|---|---|---|
| `app.status_transitions` written on every lifecycle change | ADR-004, data-model §2 and §16 | No | Lifecycle history for demand requests, bookings, occurrences and payroll runs exists only where a service writes an `audit_events` row. Several transitions write none, e.g. `payments.ts:248,253`, `allocation.ts:460`, `payments.ts:466-480` (cycle close). Disputes can't be reconstructed. |
| `idempotency_keys` | data-model §16 | No | See H-4. |
| Cluster-consistency trigger: `assignment.cluster_id = occurrence.cluster_id = employee.home_cluster_id` | data-model §12 | No | Checked only in TypeScript (`allocation.ts:93,373`). The auto-assign path checks only leave and overlap (`allocation.ts:455`), not cluster, readiness or qualification. |
| Exclusion constraint: no overlapping ACTIVE periods per component | data-model §12 | Partial: a unique index on `status = 'ACTIVE'` only | Two assignments with consecutive date ranges cannot be planned ahead. Acceptable for now; update the doc. |
| `financial_adjustments` ledger | data-model §10 | No | Refund and forfeit corrections have no ledger. |
| `payroll_line_payment_status` view | data-model §15 | No (computed in TS) | Fine; update the doc. |

**Fix**
Either build `status_transitions` with one generic trigger, or amend ADR-004 to say audit events are the history. The trigger:

```sql
create table app.status_transitions (
  id bigint generated always as identity primary key,
  entity_type text not null, entity_id uuid not null,
  from_status text, to_status text not null,
  actor_kind text, actor_id uuid, at timestamptz not null default now());
create index status_transitions_entity_idx on app.status_transitions (entity_type, entity_id, at);
create trigger status_transitions_append_only before update or delete on app.status_transitions
  for each row execute function app.tg_block_mutation();
create or replace function app.tg_record_status() returns trigger language plpgsql
security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into app.status_transitions (entity_type, entity_id, from_status, to_status, actor_kind, actor_id)
    values (tg_table_name, new.id, case when tg_op = 'UPDATE' then old.status end, new.status,
            app.claim_actor_kind(), app.claim_user_id());
  end if;
  return new;
end $$;
-- attach AFTER INSERT OR UPDATE OF status to demand_requests, bookings, subscriptions,
-- payment_orders, service_occurrences, occurrence_assignments, support_tickets, payroll_runs
```

Update `data-model.md` for every "Partial" or "No" row that is a deliberate deferral.

**Test**
A `CONFIRMED` booking has two transitions (`PENDING_PAYMENT` → `CONFIRMED`) with `actor_kind = 'system'`.

### M-9 Auto-assignment skips the hard eligibility checks of ADR-005

**Evidence**
- `apps/api/src/modules/workforce/allocation.ts:449-461`: the job inserts a STANDING assignment after `occurrenceReasons` only (leave, overlap, daily limit).
- It does not call `employeeBasics`, which covers active, ready, qualified and same cluster (`allocation.ts:367-374`).
- Deactivation is blocked while standing assignments exist (`workforce/admin-service.ts:262-264`), but `readiness` and qualifications can change without that guard.

**Failure scenario**
1. HR sets a worker to `NOT_READY` (failed verification) or removes their COOK qualification.
2. Their standing assignment stays ACTIVE, and the nightly tick keeps assigning them to new visits for up to 14 days ahead.
3. Residents receive a worker who failed verification.

**Fix**
In `maintain()`, call `employeeBasics(trx, o.employee_id, o.service_id, o.cluster_id)` as well. On failure, mark the occurrence for manual allocation; the overview already lists unassigned visits. In the readiness and qualification change paths, either refuse while standing assignments exist or end them.

**Test**
Set an employee `NOT_READY` after their standing assignment, run `maintain()`, and expect no new `occurrence_assignments` for them.

### M-10 No database-level guard that the API connects as the restricted role

**Evidence**
- `apps/api/src/config/env.ts:18-19` documents that `DATABASE_URL` must be `app_api`, but nothing checks it.
- `grep -rn "rolbypassrls\|current_user" apps/api/src` finds nothing.
- On Supabase, the `postgres` role bypasses RLS.

**Failure scenario**
An operator pastes the `postgres` pooler URL into production during an incident. Every Tier A policy, and with it the second wall, is silently off. Nothing in the logs says so.

**Fix**
At boot, run this and refuse to start (outside `test`) unless the role is `app_api` and not bypass:

```sql
select current_user, r.rolbypassrls, r.rolsuper
  from pg_roles r where r.rolname = current_user
```

**Test**
`loadEnv` plus a boot test with a stub DB that returns `rolbypassrls = true` throws.

### M-11 Webhooks, OTP hook and job outcomes have no metrics or alerts

**Evidence**
- Failures are only log lines:
  - `payments.ts:336,453`: webhook processing failed, reconciliation failed
  - `notifications/service.ts:135`: delivery failed
  - `runner.ts:43-45`: tick failed
- There is no `/metrics`, no dead-letter count, and no alert on `payment_exceptions` OPEN or `notification_outbox` DEAD.
- `/ready` (`app.ts:76-79`) checks only `select 1`.

**Failure scenario**
H-3 and H-5 failures persist for days unnoticed. Finance finds the refund gap at month-end.

**Fix**
- Expose counters with `prom-client`, or emit structured `metric` log lines that the host can alert on:
  - `webhook_processed_total{result}`
  - `job_tick_duration_seconds{job}`
  - `outbox_dead_total`
  - `provider_events_unprocessed`
  - `payment_exceptions_open`
- Add an admin overview tile for unprocessed provider events and DEAD outbox rows.

**Test**
A unit test asserts that the counters increment on failure paths.

### M-12 External side effects inside DB transactions, rolled back but not compensated

**Evidence**
- `workforce/admin-service.ts:284-285`: `authAdmin.setBanned` (Supabase Admin API) runs inside the employee-update transaction, before the audit insert.
- `residents/resident-service.ts:228`: `storage.createSignedUpload` runs inside the registration transaction. That one is harmless.

**Failure scenario**
1. HR marks an employee INACTIVE.
2. The ban call succeeds, then the audit insert fails (for example a version conflict re-read or a pool error) and the transaction rolls back.
3. The employee row says ACTIVE, but the auth user is banned. The worker cannot sign in and HR sees them as active.

**Fix**
Commit first, then call `setBanned`. On failure, queue a retry: an outbox row with `channel = 'AUTH'`, or a `pending_auth_actions` table.

**Test**
With a fake `authAdmin` and a forced audit failure, assert `setBanned` was not called.

---

## Low

### L-1 The catalogue draft-only trigger checks only the new row's version on UPDATE
`20261121000300_fix_catalogue_trigger.sql:9-25` resolves the version from `coalesce(new, old)`, so `NEW` on UPDATE.
- **Failure:** `update app.plans set catalogue_version_id = <draft> where id = <published plan>` moves a plan out of a published version, because the check sees DRAFT. No code does this today.
- **Fix:** on UPDATE, also resolve and check `old`'s version; or make `catalogue_version_id` / `plan_id` / `plan_component_id` immutable with a `before update` check.
- **Test:** the update above raises `check_violation`.

### L-2 `attach_approved_family(p_phone)` trusts its argument instead of the claim
`20261122000200_attach_family_function.sql:13-55` is granted to `app_api` and takes any phone. Today it is only called with the JWT phone (`residents/auth.ts:69`).
- **Failure:** a later caller passes a phone from input, and a third party's approved request is attached on their behalf before they sign in. The impact is limited to what was approved.
- **Fix:** take no argument. Resolve the phone from `app.resident_profiles where id = app.claim_user_id()` and require `claim_actor_kind() = 'resident'`.
- **Test:** calling it under admin claims raises `42501`.

### L-3 The attendance OTP pepper reuses `IP_HASH_SALT`
`modules/attendance/routes.ts:28`, `exports/routes.ts:93`.
- **Failure:** rotating the IP salt (a privacy action) silently invalidates every live visit code, and one leaked secret covers two purposes.
- **Fix:** add a separate `ATTENDANCE_CODE_PEPPER` (min 32) to `env.ts`.
- **Test:** an env test requires it outside `test`.

### L-4 RLS is enabled but not forced
No migration has `force row level security`.
- **Failure:** today `app_api` does not own the tables, so it is fine. If a later migration is run as `app_api`, or ownership is changed for a tool, the owner bypasses every policy.
- **Fix:** `alter table … force row level security` on each Tier A table. This is harmless for `postgres` (BYPASSRLS) and the SECURITY DEFINER helpers it owns.
- **Test:** the existing RLS suite still passes.

### L-5 The polymorphic `payment_orders.(ref_type, ref_id)` has no existence check
`20261123000100_demand_booking_payments.sql:274-275`.
- **Failure:** a bug passes a booking id with `ref_type = 'DEMAND_REQUEST'`. The order is created and paid, and `applyPurpose` returns RECORD_NOT_PAYABLE, so the money goes to review rather than being lost. The cost is a support case.
- **Fix:** add a `before insert` trigger that checks the referenced row exists, in the same community and for the same resident.
- **Test:** inserting a mismatched ref raises `foreign_key_violation`.

### L-6 Refund webhooks match the approval only by exact amount
`payments.ts:385-392`.
- **Failure:** Finance approves ₹500 but issues ₹400 in the Razorpay dashboard. The ₹400 is recorded as UNAPPROVED. The ₹500 approval stays `APPROVED` forever and counts against the refundable balance (`admin-service.ts:813-820`), blocking a correct later refund.
- **Fix:** match the oldest `APPROVED` record with `amount >= refund`. Then mark it processed, with a `processed_amount_paise` column, or raise `PARTIAL_REFUND` for review.
- **Test:** approve 500, process 400, and expect one record linked plus an exception.

### L-7 A re-created auth user with the same phone locks the resident out
`residents/auth.ts:47-52` handles a conflict on `id` only. `resident_profiles.phone` is unique (`20261122000100_residents_and_support.sql:14`).
- **Failure:** the user deletes their account in Supabase and signs up again with the same phone. The insert raises 23505 on `phone`, and every request returns 409 or 500 forever.
- **Fix:** on a phone conflict, take the documented route: support re-links, or an admin "merge account" action. Map the error to a clear message.
- **Test:** seed a profile with a phone and sign in with a new `sub` and the same phone. Expect a clear error code, not 500.

---

## API review

I inventoried all of the roughly 200 routes for authentication, authorisation, scope, pagination, idempotency and validation. The method was:
- read every `routes.ts`, the auth middlewares and `withTx` claims
- spot-check the services behind every route that takes an id

The overall picture is good:
- **Authentication:** every `/v1/admin` route sits behind `requireAdmin`, which checks MFA and loads grants fresh.
- **Authorisation:** every mutating admin route has `authorize(module, action)` or an explicit Super Admin or global check.
- **Resident and employee routes** are bound to the actor, either by an explicit `where … = actor` or by RLS.
- **Out of scope returns 404:**
  - admin: through `visibleCommunity`, `scoped*` and `inScope`
  - employee: `assignedVisit` compares the assignment with the actor and returns 404
- **Validation:** every body is validated with Zod.

The findings below are the ones that name a concrete failure. Two are new; the rest refer back to findings above.

### M-13 The forced password change can be skipped with one API call
**Evidence:**
- `apps/api/src/modules/workforce/employee-service.ts:119-122`: `POST /v1/employee/me/password-changed` clears `must_change_password` without checking anything.
- `requireEmployee` lets this path through while the flag is set (`:66-67`), and the flag is the only gate.

**Failure:**
1. HR creates a login with a temporary password and shares it by SMS or in person.
2. Anyone holding it signs in, calls `password-changed`, and uses the account indefinitely with the temporary password.
3. The "change on first sign-in" control (ADR-012) becomes advisory.

**Fix:** verify that the password really changed. Choose one:
- **Admin API check:** read the Supabase user (`auth.admin.getUserById`) and require `updated_at` after `login_enabled_at`, or better a `password_changed_at` marker the app can't forge.
- **Server-side change:** do the change on the server. The app posts `{ newPassword }`, the API calls `auth.admin.updateUserById` and then clears the flag in the same request, and sets `sessions_valid_after = now()` so the temporary-password session dies.

**Test:** with a fake auth admin that reports no password change, `POST /me/password-changed` returns 409 and the flag stays `true`.

### M-14 Lists and exports that are silently truncated or unbounded
**Evidence:**
- **Attendance export:** `GET /v1/admin/exports/attendance` uses `AttendanceService.records`, which has `.limit(500)` (`attendance/service.ts:311`, `exports/routes.ts:91-104`). The CSV gives no sign that it was cut.
  - The other exports use the shared 10,000-row cap.
  - The admin attendance screen has the same 500 limit, also without a "more" cursor.
- **Worker schedule:** `GET /v1/employee/schedule` has no limit and no cap on the `from`/`to` span (`employee-service.ts:125-140`, `workforce/routes.ts:69-73`).
- **Candidate lists:** `/allocation/components/:id/candidates`, `/visits/:id/candidates` and `/visits/:id/overtime-candidates` are unbounded. They also run one eligibility query per employee (`allocation.ts:200-224, 347-366`), which is N+1.

**Failure:**
- **Attendance export:** a cluster with 40 workers × 3 visits × 30 days has 3,600 visit rows a month. Finance exports the month and receives 500 rows sorted newest first. The first three weeks are missing, and the export is used as payroll evidence (ADR-014 flags).
- **Worker schedule:** a worker app bug sends `to = 2099-12-31`, and the query returns every future visit on each refresh.

**Fix:**
- **Exports:** page through `records` with a keyset cursor on `(scheduled_date, starts_at, id)`, the same way the other exports use `allPages`, and apply the shared 10,000 cap with a "truncated" header row when it is hit.
- **Schedule:** cap the span at 62 days with a 400 beyond it.
- **Candidates:** compute eligibility in one set-based query, or cap the candidate list at 200.

**Test:**
- Seed 1,200 visits and assert the export has 1,200 data rows.
- `GET /schedule?from=2026-01-01&to=2027-01-01` returns 400.

### Already covered above
- **Money POSTs** have an optional key, and the key is unique across all residents rather than per actor (`payment_orders.idempotency_key`). See H-4; the fix scopes keys per actor.
- **Webhooks:** no rate limit, invalid events stored and occupying the dedupe key, 200 on failure. See H-3 and M-5.
- **Exposed database messages:** RLS `WITH CHECK` violations surface as 403 (`lib/errors.ts:56-57`), and trigger messages that start with "Cannot" are shown to clients (`lib/errors.ts:55`). These are intended, human-readable and leak no data. Fine.

### L-8 Cluster-scoped finance admins see payroll runs with partial totals
`GET /payroll-runs`, `GET /payroll-runs/:id` and `/export` skip `requireGlobal`; the write routes enforce it (`payroll/service.ts:71-73,115-126,282-293`). `payroll_runs` has no RLS, so a cluster-scoped admin with `finance_payroll:view` sees every run, but the line totals (RLS-filtered) cover only their cluster.
- **Failure:** the screen shows "Net ₹1.2L, paid ₹1.2L, fully paid" for a run that is short company-wide, because the other clusters' lines are filtered out.
- **Fix:** apply `requireGlobal` to the read routes too (ADR-017 already says payroll is a global-scope function), or label the totals as "your clusters".
- **Test:** a cluster admin gets 403 on `GET /payroll-runs`.

### L-9 Not-found returns 422 on four actor-bound routes
`cancelDemandRequest` (`resident-service.ts:265-270`), change-request cancel (`change-requests.ts:106-107`), leave cancel (`employee-service.ts:192-193`) and mark-read (`notifications/service.ts:92`) throw `BUSINESS_RULE` when the row does not exist or is not the caller's. Every other route returns 404.
- **Failure:** clients can't tell "already cancelled" from "not yours or gone", and the apps show a business-rule toast for a stale id.
- **Fix:** select the row first and return `notFound` when it is missing. Keep the 422 for a wrong state.
- **Test:** cancelling another household's request returns 404.

### What the inventory found sound
- **Unauthenticated routes** are only `/health`, `/ready`, the two signed webhooks and the two public forms. The public forms are rate-limited at 5/h per IP hash, have a honeypot, and use the `public` claim plus a SECURITY DEFINER insert.
- **Admin routes without `authorize()`**, which are `/me`, `/overview`, audit, outbox and holidays, each enforce an inline Super Admin or global check, or gate each count with `can()`.
- **Resident routes that take an id** rely on RLS (household scope), and every table involved has RLS. Household-wide visibility is the intended family-sharing rule (ADR-012).
- **Pagination:** list endpoints of growing tables (admins, communities, flats, residents, tickets, bookings, payments, employees) use cursor pagination capped at 100. Exports use a shared 10,000-row cap, except attendance (M-14).
- **Error envelope:** one shape, `{ error: { code, message, fields?, requestId } }`, on every path, and the 404 handler uses it too.

---

## What is sound (checked, fine)

**Data model**
- Every business concept has one home table. Demand request, booking, subscription, payment order and occurrence are separate lifecycles, as data-model §1 requires. No table mixes two lifecycles.
- **Cardinality rules are enforced in the database**, not only in TypeScript:
  - one open cluster per community: `memberships_one_active_per_community`
  - one VERIFIED PRIMARY per flat
  - one active residence per resident
  - one active demand request per flat per cycle
  - one ACTIVE standing assignment per component
  - one ACTIVE assignment per occurrence
  - one PUBLISHED and one DRAFT catalogue per community
  - one open and one APPROVED payroll run per month
  - one open import batch per community
  - one open overtime offer per visit
  - one pending correction per visit
- **No double-booked employee:** the `btree_gist` exclusion on `occurrence_assignments` (`20261124000100:207-209`).
- **No overlapping salary periods:** the exclusion on `compensation_profiles` (`20261127000100:29-31`).
- **Foreign keys:** every reference has one. `ON DELETE RESTRICT` is the default. CASCADE is used only for true children (catalogue children of a draft, grants of a role, import rows, payroll lines of a run, demand preferences). `20261128000100_fk_indexes.sql` indexes every FK column; I spot-checked 20 of them against the migrations.
- **CHECKs:**
  - every status column has one, and each matches its code map
  - money: `amount_paise > 0`, `<> 0` with the sign tied to reversals
  - percentages 1–99, ratings 1–5, date order, lat/lng pairs
  - `snapshot_amounts`: `initial + remaining = total`
  - the disclosure is required when `initial_pct` is set
- **Snapshots:**
  - `booking_terms_snapshots` is immutable by trigger
  - `subscription_components` is copied from the snapshot, so scheduling never reads mutable catalogue rows
  - payroll lines carry `compensation_snapshot`
- **Append-only:**
  - `audit_events` blocks UPDATE, DELETE and TRUNCATE
  - `ticket_updates`, `ticket_escalations`, `salary_payments` and `expense_entries` are append-only by trigger
  - attendance evidence is immutable except for the review columns (but see M-1)
- **Idempotency keys in the schema:**
  - `provider_events.event_id`, `payment_transactions.provider_payment_id`, `payment_orders.provider_order_id`, `attendance_events (employee_id, client_event_id)` and `notification_outbox.dedupe_key` are unique
  - all of them are used by `ON CONFLICT` or caught
  - `salary_payments` refuses duplicate bank references, and `expense_entries.salary_payment_id` is unique (one expense per payment)
- **Money:** all `bigint` paise and computed on the server. Checkout and webhook settlement lock the order (`FOR UPDATE`) before the duplicate check, so concurrent checkout, webhook and reconciliation for one payment have exactly one effect.
- **Slot capacity:** re-checked under a slot row lock at payment time, as ADR-015 requires.
- **Concurrency:** a version column plus the stamping trigger on every editable table. Payroll payment recording locks the line before the overpayment check.

**Security**
- The `app` schema is not exposed. `anon` and `authenticated` have no grants, and default privileges revoke from them.
- `app_api` and `app_worker` are NOLOGIN NOBYPASSRLS, and passwords are set outside migrations.
- Claims are set with `set_config(..., is_local => true)` inside every transaction (`db/database.ts:54-71`), so they cannot leak across pooled connections.
- **A missing claim denies:**
  - `claim_actor_kind()` returns NULL, so every branch is NULL or false
  - `claim_has_cluster` with no setting returns false
  - global scope is only the explicit `'*'`
- Every UPDATE-capable Tier A policy has both USING and WITH CHECK.
- The SECURITY DEFINER helpers (`claim_household_flat_ids`, `claim_employee_*`, `slot_usage`, `submit_applicant`, `revoke_family_member`, `release_device_token`, `visit_worker_names`, `attach_approved_family`):
  - all pin `search_path = ''` and schema-qualify names
  - all `revoke all … from public` and grant narrowly
  - none builds dynamic SQL
  - `revoke_family_member` and `visit_worker_names` re-check the caller's claims themselves
- `notifications` has a column-level grant (`read_at` only). `website_enquiries` updates are column-scoped.
- **Auth:**
  - **Admins:** JWKS (ES256/RS256) with issuer and audience checks, and HS256 only when the legacy secret is configured. Admins need AAL2 MFA, which cannot be disabled in staging or production. Admin grants and scope are loaded fresh on each request.
  - **Employees:** tokens issued before a password reset are rejected (`sessions_valid_after`), and a forced password change is enforced server-side.
  - **Residents:** suspended residents are refused on each request.
- **Webhook signatures:**
  - Razorpay: HMAC over the raw body, compared with `timingSafeEqual`, mounted before the JSON parser
  - Supabase SMS hook: Standard Webhooks, with a 5-minute timestamp window
  - Checkout: the signature is verified and then the payment is re-fetched from Razorpay and matched to the order, as ADR-006 requires
- **Documents:**
  - the private bucket has size and MIME limits
  - storage keys are generated by the server (`residence/<membership>/<uuid>.<ext>`)
  - uploads use signed tokens, and downloads use short signed URLs after authorisation and audit
- **Errors and logging:**
  - one error envelope with a request id
  - unknown errors are generic, and pg errors are mapped without leaking SQL
  - pino redacts `authorization`, cookies, `*.token`, `*.otp` and `*.phone`
- **Transport:** TLS CA verification is mandatory outside development, and CORS is https-only outside development.
- **Attendance codes:** OTP and QR are HMAC-hashed with a server pepper, single-use, expire, and are voided after 5 wrong attempts. Rejected attempts are kept as evidence.

**System design**
- **Third-party timeouts:** every outbound call has one: Razorpay 15 s, FCM 15 s, Resend 15 s, MSG91 10 s, Google 10 s. No call is retried inline, which is correct for non-idempotent order creation.
- **Outbox:** written in the same transaction as the business change (`notify()`), with a dedupe key and backoff up to 6 attempts and then DEAD.
- **Occurrence generation:** idempotent (`ON CONFLICT (component, date, visit_no) DO NOTHING`) and uses the community timezone for `starts_at`.
- **Job lease:** an atomic UPDATE on a lease row, the right choice behind the transaction pooler (H-5 is about its duration, not the mechanism).
- **Configuration:** validated at boot with Zod, and the process refuses an unsafe production configuration. Secrets come only from the environment.

## Scaling limits of the current design (no action needed for V1)
- **One in-process tick** does all background work serially. It is fine up to a few thousand visits a day. Past that, move jobs to a separate worker process (ADR-003's pg-boss or the outbox table with `SKIP LOCKED`), so API latency and job duration stop sharing a pool of 10 connections.
- **Rate limiting** does one Postgres upsert per limited request. At high OTP volume, this is the hottest write path. Partitioning by day, or moving to the edge, is the next step.
- **`audit_events`, `attendance_events` and `notifications`** are the high-volume tables. Monthly partitioning (data-model §18) becomes worthwhile above roughly 10M rows.
- **Admin scope is a comma-separated claim** that `claim_has_cluster` parses per row. That is fine for tens of clusters. Above about 100 clusters per admin, pass an array claim and use `= any`.

---

## Prioritised fix plan

Each step is one PR-sized change with its tests. The order puts money and scope correctness first, then the job seams, then defence in depth.

| # | Fix | Findings | Size |
|---|---|---|---|
| 1 | Savepoint around `applyPurpose`; lock the subscription in `renew`; `bookings_one_live_renewal` index | H-2 | S |
| 2 | Webhook: re-claim unprocessed events, 500 on failure, `reprocessEvents` job; stop storing unsigned events; webhook rate limit | H-3, M-5 | M |
| 3 | `idempotency_keys` table and middleware, required on money POSTs | H-4 | M |
| 4 | Cluster move: `current_cluster_of`, insert-time stamping triggers, `move_community_scope`, block or end standing assignments on move | H-1 | M |
| 5 | Job runner: per-step isolation, longer lease with release, outbox row claim with `SKIP LOCKED`, Resend idempotency key | H-5 | S |
| 6 | `businessToday()` everywhere, `current_date` replaced in SQL, lint rule | H-6 | S |
| 7 | Balance-expiry status predicate; Razorpay call moved out of the DB transaction | M-3, M-4 | S |
| 8 | Owner-guard triggers and stricter employee insert policies; column grants and payroll freeze triggers | M-1, M-2 | M |
| 9 | Auto-assign uses full eligibility; boot-time role assertion; side effects after commit | M-9, M-10, M-12 | S |
| 9a | Server-verified password change; attendance export paging and schedule span cap | M-13, M-14 | S |
| 10 | Wrap RLS helper calls in `(select …)` | M-6 | S |
| 11 | Retention job; metrics and alerts | M-7, M-11 | M |
| 12 | `status_transitions` (or amend ADR-004) and data-model doc refresh | M-8 | M |
| 13 | Low findings | L-1 … L-9 | S each |

Steps 1–3 should land before any real money moves. Step 4 must land before the first community is moved between clusters. Steps 5 and 6 should land before a second API instance is deployed or the app is used after midnight IST, which in practice means before launch.
