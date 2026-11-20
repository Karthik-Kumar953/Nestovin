# Nestovin V1: API design

**Status:** Design baseline for all V1 modules (20 Nov 2026).
- **Built (Milestone 1):** `/v1/admin` identity, roles, admins, locations, expansion votes; `/v1/public/enquiries`.
- **Built (Phase 2):** Community Setup: services & modes, residence categories, time windows, tasks, catalogue versions, plans, components, price matrix, validation, publish, Excel migration, activation.
- **Planned:** everything else, implemented phase by phase.
- **Source of truth for request/response shapes:** Zod schemas in `packages/contracts`. OpenAPI is generated from them.

## 1. Principles

1. **One shared backend, four audiences.** The Resident app, Worker app, Admin dashboard and Public website all call the same Express API. Each audience has its own route prefix, auth method and permission model, so a resident token can never reach an admin route.
2. **The API is the security boundary.** Every request is authenticated, authorised and scope-filtered in the API. Clients never talk to the database or Supabase's Data API.
3. **Resource-oriented REST + explicit commands.** Plain CRUD uses nouns (`GET /communities`, `PATCH /communities/:id`). State changes with business meaning are named commands (`POST /demand-cycles/:id/publish`, `POST /payroll-runs/:id/approve`), never a free `PATCH status`.
4. **Contract-first.** A route exists only once its Zod request/response schemas are merged in `packages/contracts`. Mobile, admin and backend work from the same types.
5. **Server decides money and state.** Clients send intent (plan, slot, flat). The server computes amounts, percentages and transitions. Fields like `amount`, `isPaid`, `status` and `initialPct` are never accepted from residents.

## 2. Audiences and authentication

| Prefix | Who | Auth | Authorisation |
|---|---|---|---|
| `/v1/public/*` | Website visitors | none | Rate limits + honeypot |
| `/v1/admin/*` | Admin dashboard (`/admin`) | Supabase JWT (email + password) **+ TOTP (aal2)** | Module/action grants (roles + extra grants) + per-admin cluster scope; Super Admin = root |
| `/v1/resident/*` | Resident app (Expo) | Supabase JWT (phone OTP via MSG91) | Ownership: own profile, own household (verified membership); family members only after approval |
| `/v1/employee/*` | Worker app (Expo) | Supabase JWT (Employee ID → internal email + password) | Ownership: own profile, own assignments/attendance/payslip data |
| `/v1/webhooks/razorpay` | Razorpay | HMAC signature | Signature + idempotent event store; no user context |

On every authenticated request the API:
1. verifies the JWT against Supabase JWKS (signature, issuer, audience, expiry)
2. loads the actor and its status from the DB (no cache, so revocation takes effect on the next request)
3. checks permission
4. applies scope/ownership in the query
5. runs the work inside a transaction carrying the actor claims that RLS reads (ADR-001)

## 3. Conventions

| Topic | Rule |
|---|---|
| Versioning | URL major version `/v1`. Additive changes (new optional fields, new endpoints) don't bump it. Breaking changes need `/v2` routes running alongside, because mobile apps update slowly. |
| Format | JSON, `camelCase` fields, ISO-8601 UTC timestamps (`2026-11-20T06:44:56.000Z`), dates as `YYYY-MM-DD`, money as **integer paise** with `currency`. |
| IDs | UUIDs in paths. Human references (`ENQ-…`, ticket refs, employee codes) are separate fields. |
| Errors | One envelope: `{ "error": { "code", "message", "fields"?: [{path, message}], "requestId" } }`. Codes: `UNAUTHENTICATED` 401, `MFA_REQUIRED` 403, `FORBIDDEN` 403, `NOT_FOUND` 404, `VALIDATION_FAILED` 422, `BUSINESS_RULE_VIOLATION` 422, `CONFLICT` 409, `VERSION_CONFLICT` 409, `RATE_LIMITED` 429, `INTERNAL` 500. **Out-of-scope records answer 404** (existence is never revealed). |
| Pagination | Keyset: `?limit=25&cursor=…` returns `{ items, nextCursor }`. Max `limit` 100. No offsets. |
| Filtering / search | Explicit query params (`status`, `cityId`, `clusterId`, `q`). `q` is escaped for LIKE. No generic filter language. |
| Sorting | A fixed, documented sort per list. Optional `sort` only where a screen needs it. |
| Concurrency | Editable resources return `version`; `PATCH` must send it back. A mismatch returns `VERSION_CONFLICT`. |
| Idempotency | `Idempotency-Key` header **required** on POSTs that create money movements, bookings, demand requests, attendance events or salary payments. The stored response is replayed for 24 h. |
| Audit | Every mutating admin call writes an audit event in the same transaction. Commands that need a justification take a `reason` field. |
| Step-up | High-impact commands (publish demand cycle, approve payroll, record salary payment, change admin access) require a fresh aal2 session (recent TOTP) [planned]. |
| Files | Two steps: `POST …/uploads` returns a short-lived signed upload URL plus `documentId`; the client uploads to Storage; then `POST …/uploads/:documentId/complete` makes the server validate type/size/hash. Downloads go through `GET …/documents/:id/url` (60 s signed URL, audited). |
| Rate limits | Public enquiry: 5/hour/IP. OTP/login rely on Supabase limits plus API limits on sensitive commands. Payment creation: per resident per minute. |
| Caching | `Cache-Control: no-store` on all API responses. |

## 4. Endpoint catalogue

Legend: **M1** = built in Milestone 1. **P2–P8** = phase in which it ships. Permission column is `module:action` for admin routes.

### 4.1 Admin: identity & access (ADM-01, ADM-02)

| Method & path | Purpose | Permission | Status |
|---|---|---|---|
| GET `/v1/admin/me` | Current admin, effective grants, scope | any active admin | M1 |
| GET `/v1/admin/overview` | Permission-filtered counts and pending actions | `overview:view` | P3+ (grows per module) |
| GET `/v1/admin/permission-catalogue` | Modules × actions for the role editor | Super Admin | M1 |
| GET/POST `/v1/admin/roles` · GET/PATCH/DELETE `/v1/admin/roles/:id` | Reusable roles | Super Admin | M1 |
| GET/POST `/v1/admin/admins` · GET/PATCH `/v1/admin/admins/:id` | Invite, edit roles / extra grants / scope | Super Admin | M1 |
| POST `/v1/admin/admins/:id/status` | Disable / re-enable (reason required) | Super Admin | M1 |
| GET `/v1/admin/audit?targetType&targetId` | Record history panel | per-module `view` on the target | P2 |

### 4.2 Admin: locations (ADM-03, ADM-03A)

| Method & path | Purpose | Permission | Status |
|---|---|---|---|
| GET/POST `/v1/admin/cities` · PATCH `/v1/admin/cities/:id` | Cities (create/edit: global scope only) | `locations:view/create/edit` | M1 |
| GET/POST `/v1/admin/clusters` · PATCH `/v1/admin/clusters/:id` | Clusters (global scope only) | `locations:*` | M1 |
| GET/POST `/v1/admin/communities` · GET/PATCH `/v1/admin/communities/:id` | Communities (scoped) | `locations:*` | M1 |
| POST `/v1/admin/communities/:id/cluster` | Assign/move cluster (reason) | `locations:edit` | M1 |
| GET `/v1/admin/communities/:id/cluster-history` | Membership history | `locations:view` | M1 |
| GET `/v1/admin/communities/:id/towers` · POST `/v1/admin/towers` · PATCH `/v1/admin/towers/:id` | Towers | `locations:*` | M1 |
| GET `/v1/admin/towers/:id/flats` · POST `/v1/admin/flats` · PATCH `/v1/admin/flats/:id` | Flats | `locations:*` | M1 |
| GET `/v1/admin/expansion-votes` | Vote aggregates | Super Admin | M1 |

### 4.3 Admin: Community Setup wizard (ADM-04, ADM-07)

| Method & path | Purpose | Permission | Status |
|---|---|---|---|
| GET `/v1/admin/communities/:id/import-template` | Download the Excel template (lists that community's categories) | `community_migration:view` | **P2 built** |
| POST `/v1/admin/communities/:id/import-batches` (raw .xlsx body, `X-File-Name`) · GET `/v1/admin/import-batches/:id` | Upload + validation report | `community_migration:create/view` | **P2 built** |
| GET `/v1/admin/import-batches/:id/rows?onlyProblems=true` | Row-level errors and warnings | `community_migration:view` | **P2 built** |
| POST `/v1/admin/import-batches/:id/approve` · `/reject` · `/cancel` · `/commit` | Approval and transactional commit | `community_migration:approve/publish` | **P2 built** |
| GET/PUT `/v1/admin/communities/:id/services` | Enable services + operating mode per service | `catalogue_pricing:edit` | **P2 built** |
| CRUD `/v1/admin/communities/:id/residence-categories` | BHK / area categories | `catalogue_pricing:*` | **P2 built** |
| CRUD `/v1/admin/communities/:id/time-windows` | Morning/evening windows | `catalogue_pricing:*` | **P2 built** |
| CRUD `/v1/admin/communities/:id/tasks` | Task catalogue per service | `catalogue_pricing:*` | **P2 built** |
| POST `/v1/admin/communities/:id/catalogue-versions` (new draft, copies the published version) · DELETE `/v1/admin/catalogue-versions/:id` (discard draft) | Start / discard a draft | `catalogue_pricing:create` | **P2 built** |
| GET `/v1/admin/catalogue-versions/:id` | Full draft: plans, components, tasks, prices | `catalogue_pricing:view` | **P2 built** |
| CRUD `/v1/admin/catalogue-versions/:id/plans` and `/plans/:planId/components` | Plan builder | `catalogue_pricing:*` | **P2 built** |
| PUT `/v1/admin/catalogue-versions/:id/price-matrix` | Whole matrix in one call (empty cell = not offered) | `catalogue_pricing:edit` | **P2 built** |
| GET `/v1/admin/catalogue-versions/:id/validation` | Publish checks | `catalogue_pricing:view` | **P2 built** |
| POST `/v1/admin/catalogue-versions/:id/publish` | Freeze + supersede the previous version | `catalogue_pricing:publish` | **P2 built** |
| GET `/v1/admin/communities/:id/activation` · POST `/v1/admin/communities/:id/activate` | Checklist + activation (the only way to activate) | `community_migration:view/publish` | **P2 built** |
| CRUD `/v1/admin/communities/:id/slot-templates` | Fixed slots (no capacity until validated) | `scheduling:*` | P4 |

### 4.4 Admin: residents & household (ADM-05, ADM-06)

| Method & path | Purpose | Permission | Status |
|---|---|---|---|
| GET `/v1/admin/residents` · GET `/v1/admin/residents/:id` | Search/view (scoped) | `residents:view` | P3 |
| GET `/v1/admin/residence-verifications?status=PENDING` · POST `…/:id/approve` · `…/:id/reject` | Residence review queue | `residents:approve` | P3 |
| GET `/v1/admin/family-requests` · POST `…/:id/approve` · `…/:id/reject` | Family approvals (records physical verification) | `family_requests:view/approve` | P3 |
| GET `/v1/admin/resident-change-requests` · POST approve/reject | Restricted profile edits | `residents:approve` | P3 |
| GET `/v1/admin/documents/:id/url` | Signed download (audited) | module of the owning record | P3 |

### 4.5 Admin: demand, bookings & payments (ADM-08)

| Method & path | Purpose | Permission | Status |
|---|---|---|---|
| CRUD `/v1/admin/demand-cycles` (draft) | Configure cycle incl. `initialPct` | `demand_payments:create/edit` (percentage: **Super Admin**) | P4 |
| POST `/v1/admin/demand-cycles/:id/publish` · `/close` · `/cancel` | Lifecycle (publish locks the percentage) | Super Admin / `demand_payments:publish` | P4 |
| GET `/v1/admin/demand-cycles/:id/aggregates` | Demand by service, plan, window, slot preference | `demand_payments:view` | P4 |
| CRUD `/v1/admin/demand-cycles/:id/slot-sets` · POST `…/approve` · `…/publish` | Slots, commencement date, balance deadline | `demand_payments:approve/publish` | P4 |
| GET `/v1/admin/demand-requests` · `/bookings` · `/subscriptions` | Separate lists, never merged | `demand_payments:view` | P4 |
| GET `/v1/admin/payment-orders` · `/payment-exceptions` · POST `…/exceptions/:id/resolve` | Verified states, exception queue | `demand_payments:view/approve` | P4 |
| POST `/v1/admin/reminders` | Manual balance reminder (no state change) | `demand_payments:edit` | P4 |

### 4.6 Admin: workforce, scheduling, allocation (ADM-09 to ADM-11)

| Method & path | Purpose | Permission | Status |
|---|---|---|---|
| GET `/v1/admin/applicants` · POST `…/:id/convert` | Applicant intake → employee | `employees:view/create` | P5 |
| CRUD `/v1/admin/employees` · POST `…/:id/enable-login` · `…/:id/reset-password` | Profiles, Employee ID login | `employees:*` | P5 |
| PUT `/v1/admin/employees/:id/qualifications` · `/verification-items/:code` | Readiness | `employees:approve` | P5 |
| CRUD `/v1/admin/training-items` | Video links (no LMS) | `employees:edit` | P5 |
| GET `/v1/admin/leave-requests` · POST approve/reject | Leave queue | `employees:approve` | P5 |
| GET `/v1/admin/allocation/needs?clusterId&date` | Components/occurrences without an employee | `allocation:view` | P5 |
| GET `/v1/admin/allocation/candidates?componentId` | Eligible employees + exclusion reasons | `allocation:view` | P5 |
| POST `/v1/admin/standing-assignments` · POST `…/:id/end` | Confirm / end a standing assignment | `allocation:create/edit` | P5 |
| POST `/v1/admin/occurrences/:id/replace` | One-day replacement | `allocation:edit` | P5 |
| CRUD `/v1/admin/overtime-offers` · POST `…/recipients/:id/confirm` | Offer → accept → admin confirm | `allocation:create/approve` | P5 |

### 4.7 Admin: attendance, support, payroll (ADM-12 to ADM-14)

| Method & path | Purpose | Permission | Status |
|---|---|---|---|
| GET `/v1/admin/attendance-events?flagged=true` · `/occurrences/:id/timeline` | Evidence review | `attendance:view` | P6 |
| GET `/v1/admin/attendance-corrections` · POST approve/reject | Corrections (original preserved) | `attendance:approve` | P6 |
| GET `/v1/admin/feedback` | Ratings and comments | `attendance:view` | P6 |
| GET `/v1/admin/tickets` · GET/PATCH `/v1/admin/tickets/:id` | Queue, categorise, assign | `support:view/edit` | P3 |
| POST `/v1/admin/tickets/:id/updates` (`visibility`) · `/escalate` · `/resolve` · `/close` | Ticket workflow | `support:*` | P3 / P7 |
| GET/PATCH `/v1/admin/enquiries` | Website enquiries | `support:view/edit` | P1b |
| CRUD `/v1/admin/compensation-profiles` | Employee pay basis | `finance_payroll:edit` | P8 |
| POST `/v1/admin/payroll-periods/:id/runs` · GET `/v1/admin/payroll-runs/:id` | Prepare a run (flags missing inputs) | `finance_payroll:create/view` | P8 |
| POST `/v1/admin/payroll-runs/:id/submit` · `/approve` · `/return` | Review / approval | `finance_payroll:approve` | P8 |
| POST `/v1/admin/payroll-lines/:id/payments` · `…/payments/:pid/reverse` | Record manual transfer → expense auto-linked | `finance_payroll:record_payment` | P8 |
| GET `/v1/admin/finance/revenue-summary` · `/reports/:code` | Basic reports / exports | `finance_payroll:view/export` | P8 |

### 4.8 Resident app (`/v1/resident`)

| Method & path | Purpose | Status |
|---|---|---|
| GET `/v1/resident/me` · PATCH `/v1/resident/me` | Profile (self-service fields only) | P3 |
| GET `/v1/resident/locations/cities` · `/cities/:id/communities` | Selectable locations | P3 |
| POST `/v1/resident/expansion-votes` | One vote per location (409 if repeated) | P3 |
| POST `/v1/resident/residence` (+ uploads) · GET `/v1/resident/residence` | Register flat, verification status | P3 |
| GET/POST `/v1/resident/family-requests` | Primary resident only | P3 |
| GET `/v1/resident/catalogue` | Services, plans, prices for **their** flat's category | P3/P4 |
| GET `/v1/resident/demand-cycles/current` · POST `/v1/resident/demand-requests` | Demand-led request (server computes amount) | P4 |
| GET `/v1/resident/availability?serviceId&planId` · POST `/v1/resident/bookings` | Continuous booking (slot revalidated) | P4 |
| POST `/v1/resident/payments/orders` → `{ razorpayOrderId, amount, key }` · POST `/v1/resident/payments/verify` | Create order, client callback (server re-fetches from Razorpay) | P4 |
| GET `/v1/resident/requests` · `/bookings` · `/subscriptions` · `/occurrences` | Status and history (distinct lists) | P4/P6 |
| GET `/v1/resident/occurrences/:id/attendance-code` | OTP/QR for the visit (mechanics [OPEN]) | P6 |
| POST `/v1/resident/occurrences/:id/confirm` · `/feedback` | Confirmation, rating | P6 |
| GET/POST `/v1/resident/tickets` · POST `…/:id/updates` | Support | P3 |
| GET `/v1/resident/notifications` · POST `/v1/resident/devices` | Inbox, push token | P7 |

### 4.9 Worker app (`/v1/employee`)

| Method & path | Purpose | Status |
|---|---|---|
| POST `/v1/public/applicants` | Applicant interest (no login) | P5 |
| GET `/v1/employee/me` · `/qualifications` | Own profile | P5 |
| GET `/v1/employee/training` · POST `…/:id/complete` | Training videos | P5 |
| GET `/v1/employee/schedule?from&to` | Own assignments only | P5 |
| GET/POST `/v1/employee/leave-requests` · PUT `/v1/employee/availability` | Leave and availability | P5 |
| GET `/v1/employee/overtime-offers` · POST `…/:id/accept` · `/reject` | Optional extra work | P5 |
| POST `/v1/employee/attendance-events` (Idempotency-Key = `clientEventId`) | Check-in/out with OTP/QR + one location reading | P6 |
| POST `/v1/employee/occurrences/:id/completion` · `/no-show` | Completion, 15-min no-show | P6 |
| POST `/v1/employee/attendance-corrections` | Correction request | P6 |
| GET `/v1/employee/notifications` · POST `/v1/employee/devices` | Inbox, push token | P7 |

### 4.10 Public & webhooks

| Method & path | Purpose | Status |
|---|---|---|
| POST `/v1/public/enquiries` | Website enquiry (202 + reference) | M1 |
| POST `/v1/public/applicants` | Worker applicant interest | P5 |
| POST `/v1/webhooks/razorpay` | `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`. Raw event stored first (unique event id), processed by a job | P4 |
| GET `/health` · GET `/ready` | Liveness / readiness | M1 |

## 5. Key flow contracts

**Demand request + initial payment (P4):**
1. `POST /v1/resident/demand-requests` with `{ cycleId, planId, addonComponentIds[], slotPreferences[] }` and an `Idempotency-Key`.
2. The server validates the verified membership, the open cycle and that the plan is eligible for the flat's category. It snapshots terms and computes `initialDue = round_half_up(total × cycle.initialPct / 100)`.
3. Returns `{ requestId, status: AWAITING_PAYMENT, amountDuePaise, currency }`.
4. `POST /v1/resident/payments/orders` with `{ refType: DEMAND_REQUEST, refId, purpose: INITIAL }`. The server creates the Razorpay order for **its own computed amount**.
5. The app opens Razorpay Checkout, then calls `POST /v1/resident/payments/verify` with `{ razorpayOrderId, razorpayPaymentId, razorpaySignature }`. The server checks the signature, **fetches the payment from Razorpay**, and compares amount, currency, order and purpose. Only then does it record the transaction and set the request to COMMITTED, in one DB transaction.
6. The webhook and reconciliation job reach the same verification path idempotently, so a lost client callback still settles.

**Attendance check-in (P6):** `POST /v1/employee/attendance-events` with `{ clientEventId, occurrenceId, kind, method, code|qrPayload, deviceTime, location: { lat, lng, accuracyM } }`. The server checks:
- the assignment is the caller's
- the challenge is valid and unused
- the time window

It then computes distance from the community/tower reference and stores the event with `result` + `flags`. A repeated `clientEventId` returns the original result.

## 6. Versioning & mobile compatibility

- Mobile apps send `X-App-Version` and `X-App-Platform`. The API can answer `426 Upgrade Required` for builds below a configured minimum.
- Fields are only ever added. Removal happens in `/v2`.
- Enum values may grow. Clients must handle unknown values with a safe default ("Updating…" status label).
