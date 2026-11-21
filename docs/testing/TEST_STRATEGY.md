# Nestovin test strategy and coverage matrix

Owner: QA session. Last updated 21 Nov 2026 (branch `claude/qa-tests-7e2388`).
Behaviour comes from these sources, in order: `docs/Architecture/Nestovin_Individual_Module_Workflows_v1.0_Final.md`, then ADRs 012–017 (which override the PRD), then the PRD v1.1 test lists (PAY-01…16, FLOW-01…25).

## 1. The pyramid

| Layer | Tool | Where | What it proves | Command (repo root unless noted) |
|---|---|---|---|---|
| Unit | Vitest | `apps/api/test/unit`, `packages/contracts/src/*.test.ts` | Pure rules (pricing split, proration, deadlines, CSV safety), contracts, and the **route authZ matrix** with a fake DB | `corepack pnpm --filter @nestovin/api test` |
| Integration | Vitest + dev Supabase | `apps/api/test/integration` | Services and SQL with RLS as the restricted `app_api` role, the HTTP **data-scope matrix**, the PAY rules, webhooks, idempotency and job reruns | `corepack pnpm --filter @nestovin/api test:integration` |
| E2E (web) | Playwright | `apps/web/e2e` (admin), `apps/resident/e2e` (Expo web) | Real browser against the running API and Next.js admin, or the Resident web build | `corepack pnpm e2e:admin` / `corepack pnpm e2e:resident-web` |
| E2E (native) | Maestro | `apps/resident/.maestro`, `apps/employee/.maestro` | Flows web cannot run: Razorpay Checkout, push tap, Worker check-in by code and QR | `maestro test apps/resident/.maestro` (see `MOBILE_TESTING.md`) |
| UAT | Manual script | `UAT_CHECKLIST.md` | The owner walks the product as a client would | — |

Rules every suite follows:
- **Fixtures are scoped and cleaned up.**
  - Integration data is namespaced (`QA<rand>`) and removed in `afterAll` by `test/helpers/qa-fixtures.ts`. It walks foreign keys from the roots; append-only triggers are switched off only inside that cleanup transaction.
  - Audit rows are kept, because they are evidence.
  - Older suites (written before QA) still leave uniquely named data behind; see §5.
- **E2E data is prefixed `E2E-<runid>`.** Specs that change shared state irreversibly (payroll approval) are opt-in with `E2E_ALLOW_SHARED_WRITES=1`.
- **No real credentials in code.** Admin E2E reads `E2E_ADMIN_*` from the git-ignored `e2e/.env.e2e`; the resident specs read `E2E_RESIDENT_*`.
- **Bugs stay visible.** A test that exposes a bug is kept as `it.fails` / `test.fail` and listed in `BUGS.md`.

### Running integration suites against the shared dev database
Integration suites share one Postgres. Inside one run, Vitest already runs the files one after another (`fileParallelism: false`). Across worktrees nothing coordinates, so:

- **Run one integration suite per database at a time.** Before starting, tell the other sessions. Better still, point each worktree at its own local Supabase (`supabase start`). Two runs at once slow every query, so hooks time out, and they see each other's data.
- **Organisation-wide rules are the hazard.** Rules that read every active row, not your own fixture, break other suites while your run is active:
  - **Required verification items:** readiness needs every ACTIVE required item.
    - Suites must not assume theirs is the only one. Use `makeReadyTolerant()` (`test/helpers/qa-fixtures.ts`), which verifies every active required item and retries once.
    - Deactivate or delete your own item in `afterAll` before anything slow.
  - **Training items:** only listed on the employee profile, not used for readiness today. Treat them like verification items if that changes.
  - **Business holidays:** these shift working-day deadlines (escalation, ADR-014).
    - The escalation suite asserts only a lower bound (more than 47 hours away). Extra holidays only push the deadline later, so other rows cannot break it.
    - Admin E2E adds holidays only in 2090 and later, and removes them afterwards.
  - **Payroll periods:** a month is organisation-wide, so the payroll suite picks a random unused past month and deletes it afterwards.
  - **Notification outbox:** any API process running with `JOBS_ENABLED` against the same database delivers outbox rows that a test expects to stay pending or be skipped. Stop other API dev servers, or run them with `JOBS_ENABLED=false`, while the notifications suite runs.
- **Cleanup runs last in `afterAll`,** after the suite's own resets, and the hook gets a 3-minute timeout. A slow FK-walking cleanup must never stop a suite from deactivating its global rows.

## 2. Route authorisation matrix (every route)

The unit test discovers every route from `apps/api/src/modules/*/routes.ts`. It then checks the list against what Express actually mounts, so a new route is covered automatically, and a new admin route with no guard fails until someone reviews it.

| Check | Layer | Test | Status |
|---|---|---|---|
| 401 without a token: all admin, resident and worker routes | unit | `route-authz-matrix.test.ts` | ✅ |
| 403 `MFA_REQUIRED` for an aal1 admin session | unit | same | ✅ |
| 403 for an admin with no grants | unit | same | ✅ (1 known bug: BUG-QA-001) |
| 403 with **every other grant** except the route's module:action | unit | same | ✅ |
| Passes with **only** the route's grant | unit | same | ✅ (1 known bug: BUG-QA-002) |
| Super Admin passes everywhere; Super-Admin-only routes refuse an admin holding all grantable permissions | unit | same | ✅ |
| Resident and worker APIs refuse admin or other non-phone / non-staff sessions | unit | same | ✅ |
| 404 out of scope / 200 in scope (locations, catalogue, migration, scheduling, demand, residents, support tickets, employees, compensation) | integration | `route-scope-matrix.test.ts` | ✅ |
| Lists filtered by scope; an out-of-scope write is 404 and changes nothing | integration | same | ✅ |
| RLS cross-cluster sweep (every RLS table with `cluster_id`) | integration | same | ✅ |
| RLS cross-household sweep (every RLS table with `resident_id`) and write denial | integration | same, plus `residents-support`, `bookings-payments` | ✅ |
| 404 / 200 scope for visits, attendance records and payroll runs by id | integration | `workforce`, `attendance`, `payroll` (service level) | 🟡 service-level only; HTTP rows still to add |

## 3. PAY-01…16 (PRD §payments; ADR-013/015)

| ID | Rule | Unit | Integration | E2E | Status |
|---|---|---|---|---|---|
| PAY-01 | 0% rejected | `pay-contracts` | `pay-rules` (DB check) | `demand-cycles.spec` | ✅ |
| PAY-02 | 100% rejected for demand-led | `pay-contracts` | `pay-rules` (DB check) | `demand-cycles.spec` | ✅ |
| PAY-03 | >100 / non-numeric rejected | `pay-contracts` | `pay-rules` | — | ✅ |
| PAY-04 | Client-tampered percentage or amount ignored | `pay-contracts` (stripped) | `pay-rules` (server amounts) | — | ✅ |
| PAY-05 | Percentage locked after publication | — | `pay-rules`, `bookings-payments` (API + DB trigger) | `demand-cycles.spec` | ✅ |
| PAY-06 | New cycle uses its own percentage | — | `pay-rules` | — | ✅ |
| PAY-07 | Existing commitment unchanged after future changes | — | `pay-rules` | — | ✅ |
| PAY-08 | `paid=true` without verification stays unpaid | `pay-contracts` | `pay-rules` (forged + authorised-only) | — | ✅ |
| PAY-09 | Invalid webhook signature rejected | `pay-contracts` (HTTP 400) | `pay-rules`, `bookings-payments` | — | ⚠️ BUG-QA-003 |
| PAY-10 | Repeated webhook → one effect | — | `pay-rules` (checkout + webhook + retry + second event id) | — | ✅ (see BUG-QA-003) |
| PAY-11 | Amount / currency / order mismatch → review | — | `pay-rules`, `bookings-payments` | `payments.spec` (exceptions view) | ✅ |
| PAY-12 | Replay against another booking rejected | — | `pay-rules` (signature + RLS) | — | ✅ |
| PAY-13 | Partial initial payment does not commit | — | `pay-rules` | — | ✅ |
| PAY-14 | Unpaid balance → no activation | — | `pay-rules`, `bookings-payments` | — | ✅ |
| PAY-15 | Continuous not verified → not confirmed | — | `pay-rules` | Maestro `razorpay_*` | ✅ API / 🔲 native not run |
| PAY-16 | Adjustment is a separate record + audit; original preserved | — | `pay-rules` (refund record, audit, append-only) | `payments.spec` (skips: needs a real payment) | ✅ API |
| — | Idempotency-Key: retries reuse one order; key reuse refused | — | `pay-rules` | — | ✅ |
| — | Payment maintenance job rerun is a no-op | — | `pay-rules`, `bookings-payments` | — | ✅ |

## 4. FLOW-01…25

| ID | Rule | Integration (API) | E2E | Status |
|---|---|---|---|---|
| FLOW-01 | Invalid / expired OTP rejected, rate-limited | `sms-hook` (unit, hook signature) | resident `sign-in.spec` (mocked), Maestro `sign_in_validation` | 🟡 Supabase owns OTP; app message bug BUG-QA-006 |
| FLOW-02 | Incomplete residence proof → no access | `residents-support` (PENDING until document; queue only after upload) | resident `onboarding.spec` | ✅ API |
| FLOW-03 | Family request blocked until approval | `residents-support` (family) | admin `residents.spec` (family block) | ✅ API |
| FLOW-04 | Family request rejected → blocked, Primary notified | `residents-support`, `notifications` | admin `residents.spec` (skips: needs a real request) | 🟡 notification-on-reject not asserted |
| FLOW-05 | Catalogue shows only enabled Maid/Cook/Caretaker | `community-setup` (publish), `bookings-payments` (options) | resident `booking.spec` | ✅ |
| FLOW-06 | Incompatible plan/residence rejected | `bookings-payments` (Cook on demand-led, wrong service) | — | ✅ |
| FLOW-07 | Cycle not open → no commitment | `pay-rules` FLOW-07 (draft, not yet open, slots published) | — | ✅ |
| FLOW-08 | Verified demand payment → one commitment in aggregation | `bookings-payments` (summary counts) | — | ✅ |
| FLOW-09 | Published slots show total / paid / outstanding | `bookings-payments` | resident `booking.spec` | ✅ API |
| FLOW-10 | Balance paid → activation after all gates | `bookings-payments`, `workforce` (standing assignment activates) | — | ✅ |
| FLOW-11 | Stale continuous slot rejected | `bookings-payments` (capacity re-check → review) | — | ✅ |
| FLOW-12 | Continuous verified → confirmed + capacity | `pay-rules` PAY-15, `bookings-payments` | Maestro `razorpay_*` | ✅ API |
| FLOW-13 | Unready employee excluded | `workforce` (readiness, candidates) | admin `employees.spec` | ✅ |
| FLOW-14 | Conflict / capacity → candidate rejected | `workforce` (double-booking refused by DB) | admin `allocation.spec` | ✅ |
| FLOW-15 | Routine assignment confirmed by Ops, no accept step | `workforce` | admin `allocation.spec` (skips: needs bookings) | ✅ API |
| FLOW-16 | Manual replacement validated, history kept | `workforce` (leave, permanent replacement) | — | ✅ |
| FLOW-17 | Valid OTP / QR attendance recorded | `attendance` | Maestro worker `attendance_check_in_code` / `_qr` | ✅ API / 🔲 native not run |
| FLOW-18 | Invalid verification → no attendance | `attendance` (wrong code recorded, not verified) | Maestro `attendance_check_in_invalid_code` | ✅ API |
| FLOW-19 | Offline duplicate sync prevented | — | — | 🔲 **Gap**: no offline queue in the API yet; ask the lead |
| FLOW-20 | Completion stored; resident confirmation | `attendance` (completion + feedback once) | — | ✅ |
| FLOW-21 | Resident no-show: 15-min wait recorded | `attendance` (no-show after wait) | — | ✅ |
| FLOW-22 | Correction keeps original, linked + audited | `attendance` (correction reviewed, original kept) | admin `attendance.spec` (skips) | ✅ API |
| FLOW-23 | Resident ticket created, routed, visible to Support | `residents-support`, `escalation` | resident `support.spec`, admin `support-tickets.spec` | ✅ API |
| FLOW-24 | Website enquiry confirmed and routed | unit `auth-guards` (public route), `exports` | — | 🟡 public website not built yet |
| FLOW-25 | Payroll explainable, reviewable, approvable | `payroll` (unit proration + integration run) | admin `payroll.spec` (opt-in) | ✅ |

## 5. Workflow coverage (Resident, Worker, Admin)

Legend: ✅ covered and passing · 🟡 partial · 🔲 not covered yet · ⛔ blocked (see the note).

### Resident (RES)
| Workflow | API tests | Web E2E (`apps/resident/e2e`) | Native (Maestro) | Status |
|---|---|---|---|---|
| RES-01 OTP login | unit `route-authz-matrix` (phone session only) | `sign-in.spec`, `auth-guard.spec` | `sign_in_phone_otp`, `sign_in_validation` | ⛔ web: BUG-QA-004, no react-native-web |
| RES-02 / 02A City, community, demand voting | `residents-support` | `onboarding.spec` | — | 🟡 web blocked |
| RES-03 Residence registration | `residents-support` | `onboarding.spec` | document upload: manual | 🟡 |
| RES-04 Family | `residents-support`, `change-requests` | `household.spec` | — | ✅ API |
| RES-05 / 06 Catalogue, plans | `community-setup`, `bookings-payments` | `booking.spec` | — | ✅ API |
| RES-07A–D Demand and continuous booking | `bookings-payments`, `pay-rules` | `booking.spec` (stops before payment) | — | ✅ API |
| RES-08 Razorpay | `pay-rules`, `bookings-payments` | — (native module) | `razorpay_test_payment_upi`, `_card`, `razorpay_cancel` | ✅ API / 🔲 native not run |
| RES-09 / 10 Status and history | `bookings-payments`, `attendance` | `visits-updates-profile.spec` | `visit_check_in_code` | ✅ API |
| RES-11 Feedback | `attendance` | — | — | ✅ API |
| RES-12 Support | `residents-support`, `escalation` | `support.spec` | — | ✅ API |
| RES-13 Notifications | `notifications` | `visits-updates-profile.spec` (inbox) | `push_notification_tap` | ⚠️ BUG-QA-005 |
| RES-14 Profile and household | `change-requests`, `residents-support` | `household.spec`, `visits-updates-profile.spec` | — | ✅ API |

### Worker (EMP)
`apps/employee` is being built on another branch. The Maestro flows are skeletons with a placeholder appId, and labels are marked `TODO(app)`.

| Workflow | API tests | Native (Maestro) | Status |
|---|---|---|---|
| EMP-01 Applicant | `workforce` | — | ✅ API |
| EMP-02 Employee ID login | unit matrix (staff session only), `workforce` | `employee_sign_in`, `_invalid` | ✅ API / ⛔ app not merged |
| EMP-03 / 04 Profile, training | `workforce` | — | 🟡 |
| EMP-05 Schedule | `workforce` (own schedule only, RLS) | — | ✅ API |
| EMP-05 Visit detail `GET /v1/employee/visits/:id`; tasks, duration and add-ons on schedule items; `homeClusterName` / `joinedOn` on `/me` (lead branch `gaps-before-apps`) | unit matrix picks up the route automatically after merge (401 without a token, refused for a non-staff session) | — | 🔲 after merge: integration test for own-visit 200 / other worker's visit 404 and the new fields |
| EMP-06 Attendance code / QR / location | `attendance` | `attendance_check_in_code`, `_qr`, `_invalid_code` | ✅ API / ⛔ app |
| EMP-07 Completion | `attendance` | — | ✅ API |
| EMP-08 Overtime | `overtime` | — | ✅ API |
| EMP-09 Leave | `workforce` | — | ✅ API |
| EMP-10 Notifications | `notifications` | `push_notification_tap` | ✅ API / ⛔ app |

### Admin (ADM-01…14), Playwright specs in `apps/web/e2e`
| Module | API unit (authZ) | API integration | Playwright spec | Status |
|---|---|---|---|---|
| ADM-01 Overview | matrix (any admin) | — | `auth.spec` (landing) | 🟡 widgets per grant not asserted |
| ADM-02 Admins and roles | matrix (Super Admin only), `auth-guards`, `permissions` | `db-guards` | `access.spec` | ✅ |
| ADM-03 / 03A Locations, expansion votes | matrix | `locations-scope`, `route-scope-matrix` | `locations.spec` | ⚠️ BUG-QA-002 |
| ADM-04 Migration (Excel and grid) | matrix | `community-setup`, `migration-grid` | `setup-wizard.spec` | ✅ |
| ADM-05 Residents and verification | matrix | `residents-support`, `route-scope-matrix` | `residents.spec` | ✅ API |
| ADM-06 Family requests | matrix | `residents-support` | `residents.spec` | ✅ API |
| ADM-07 Catalogue and pricing publish | matrix | `community-setup` | `catalogue.spec`, `setup-wizard.spec` | ✅ |
| ADM-08 Demand, bookings, payments | matrix | `bookings-payments`, `pay-rules` | `demand-cycles.spec`, `payments.spec` | ✅ API |
| ADM-09 Employees | matrix | `workforce` | `employees.spec` | ✅ API |
| ADM-10 Scheduling | matrix, `bookings` (publish needs publish) | `bookings-payments` | `demand-cycles.spec` (slots) | ✅ |
| ADM-11 Allocation and overtime | matrix | `workforce`, `overtime` | `allocation.spec` | ✅ API |
| ADM-12 / 12A Attendance and corrections | matrix, unit `attendance` | `attendance` | `attendance.spec` | ✅ API |
| ADM-13 Support and escalation | matrix, unit `escalation` | `residents-support`, `escalation` | `support-tickets.spec` | ✅ API |
| ADM-14 Finance and payroll | matrix, unit `payroll` | `payroll` | `payroll.spec` (opt-in), `exports.spec` | ✅ |
| Exports (all modules) | unit `exports` (export action, CSV safety) | `exports` | `exports.spec` | ✅ |
| Audit log | unit `audit-access` | `locations-scope` (audit row per change), `pay-rules` (refund audit) | `audit.spec` | ✅ |

## 5a. Architecture review findings (claude/arch-review-b0d127)

These tests write no money or payroll data:
- **Unit tests** run the real services on a scripted in-memory Kysely driver (`test/helpers/scripted-db.ts`) that records every statement and lets a test inject a failure.
- **The grants check** reads only the Postgres catalogue.

| Finding | What the test proves | Test | Status |
|---|---|---|---|
| H-2 | A failing payment effect must go to review and keep the evidence, not roll back | unit `review-findings` → "H-2" | ⚠️ BUG-QA-014 (it.fails) |
| H-3 | A webhook whose processing failed must be retried (or answered non-2xx) | unit `review-findings` → "H-3" | ⚠️ BUG-QA-012 |
| H-7 | Reconciliation must rotate through open orders (ORDER BY plus a last-checked marker) | unit `review-findings` → "H-7" | ⚠️ BUG-QA-013 |
| M-17 | Check-in must lock the ACTIVE assignment as well as the occurrence | unit `review-findings` → "M-17" (lock shape) | ⚠️ BUG-QA-015; a real two-connection race needs booking fixtures, deferred |
| M-2 | Money evidence and approved payroll lines are immutable for `app_api` | integration `money-immutability` (read-only) | ⚠️ BUG-QA-016 |
| M-2 race | A payroll entry cannot land in a run being submitted (the run row is locked) | unit `review-findings` → "M-2 race" | ⚠️ BUG-QA-017 |

## 6. Known gaps and next steps
1. **Admin E2E runs signed in** (80 pass, 24 skip by design; see TEST_RESULTS.md). The skips need resident or worker data; see item 7.
2. **Resident web E2E is blocked.** `apps/resident` needs `react-native-web` and `react-dom`, and BUG-QA-004 must be fixed.
3. **Maestro has not run.** It needs Maestro on the machine, an Android emulator, a dev build, and the Worker app merged.
4. **FLOW-19 (offline dedupe) has no API surface to test.** Confirm the design with the lead.
5. **HTTP scope rows to add:** visits, attendance records and payroll runs by id. Their service-level scope tests exist.
6. **Fixture cleanup in older suites.** `bookings-payments`, `workforce` and the other pre-QA suites leave uniquely named rows in the dev DB. Moving them to `Fixtures.cleanup()` is test-only work and comes next.
7. **The admin E2E flows that need resident or worker data skip.** These are approving verifications, refunds and allocation. A seeded "demo community" fixture (an API script the lead owns) would let them run.
