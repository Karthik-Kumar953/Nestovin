# Test results summary

Run on 21 Nov 2026 by the QA session.
- **Branch:** `claude/qa-tests-7e2388`
- **Machine:** Windows 11, Node 24
- **Database:** shared dev Supabase project

| Suite | Command (repo root) | Pass | Fail | Expected fail (known bug) | Skipped | Not run |
|---|---|---|---|---|---|---|
| API unit | `corepack pnpm --filter @nestovin/api test` | 1287 | 0 | 2 (BUG-QA-001, -002) | 0 | — |
| API integration | `corepack pnpm --filter @nestovin/api test:integration` | 118 | 0 | 1 (BUG-QA-003) | 0 | — |
| Admin E2E (Playwright, signed in) | `corepack pnpm e2e:admin` | 80 | 0 | 0 | 24 (by design, see below) | — |
| Resident web E2E (Playwright) | `corepack pnpm e2e:resident-web` | — | — | — | — | ⛔ blocked: `apps/resident` has no `react-native-web`; BUG-QA-004 |
| Maestro (native) | `maestro test apps/resident/.maestro` | — | — | — | — | 🔲 not run: no Maestro or emulator on this machine; Worker app not merged |

Notes:
- **Unit suite crash.** The first unit run hit the known Windows Vitest worker crash (exit 3221226505) on `route-authz-matrix.test.ts`. One rerun was clean.
- **Integration duration.** About 17 minutes against the hosted dev database, run sequentially. QA fixtures clean up after themselves; checked by querying for `QA %` rows after a run (0 left).
- **Admin E2E sign-in.** Uses the E2E Super Admin seeded by the admin-portal session. Its credentials are in the git-ignored `e2e/.env.e2e` and were never printed.
- **Admin E2E ports.** It runs on its own ports (API 4200, web 3200) so it cannot collide with other sessions' dev servers.
- **Admin E2E history.** Before the fixes in commit `e692bc4` it failed for test-side reasons only:
  - label matching of required fields
  - a form that resets on load
  - provisioning missing a task
  - an API dev server restarting in watch mode
  
  No admin UI bug reproduced at run time.

## Admin E2E skips (24): why each one does not run yet
Most need data that only the mobile apps create. A seeded "demo community" script (lead-owned) would unlock them.
- Residence verification approve/reject, family request decisions, change-request decisions, resident suspension: these need a real resident from the Resident app.
- Payments:
  - refund and resolving an exception need a Razorpay payment;
  - a booking reminder needs a PENDING_PAYMENT booking;
  - slot-set "Approve and publish" needs a COMMITTED request.
- Allocation: assign, cover/replace, and overtime offer/confirm need bookings, visits and the Worker app.
- Attendance: review, no-show and corrections need Worker-app check-ins.
- Employees: applicants and leave requests come from the Worker app.
- Support: reply, note and escalation run only on an open ticket whose subject contains "E2E"; escalating real tickets is avoided.
- Payroll: approve and pay is opt-in with `E2E_ALLOW_SHARED_WRITES=1`, because approval is irreversible on the shared DB.
- A few others depend on an earlier serial step, or on no data existing yet.

## Known bugs
See `BUGS.md`.
- **High:** BUG-QA-003 (webhook pre-emption, API) and BUG-QA-004 (Resident web sign-in).
- **Medium:** BUG-QA-005 (push tap).
- **Low:** the rest.
