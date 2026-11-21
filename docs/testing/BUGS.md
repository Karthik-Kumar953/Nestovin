# Known bugs found by the test suites

Each bug has a test kept in the suite as an expected failure (`it.fails` / `test.fail`) or a skip that points here. When a fix lands, the test starts "unexpectedly passing": flip it to a normal test and move the entry to **Fixed**.

Severity:
- **High:** money, a data leak, or a broken core flow
- **Medium:** wrong behaviour with a workaround
- **Low:** an inconsistency, or an information leak that exposes no data

Owner: the lead fixes `apps/api`. Web and mobile bugs go through the lead to the owning session.

| ID | Sev | Area | Summary | Status |
|---|---|---|---|---|
| BUG-QA-003 | **High** | API payments | An unsigned webhook can pre-empt and silently drop the genuine Razorpay event | **Fixed** (e0290b0) |
| BUG-QA-004 | **High** | Resident app (web) | Sign-in never finishes on the Expo web build | Fixed on `claude/resident-app-0932e5` (e539651), not merged yet |
| BUG-QA-005 | Medium | Resident app | Tapping a push opens the app, not the related screen | Fixed on `claude/resident-app-0932e5` (e539651), not merged yet |
| BUG-QA-001 | Low | API support | `POST /holidays` validates the body before the Super Admin check | **Fixed** (e0290b0) |
| BUG-QA-002 | Low | API locations | Expansion votes are guarded by `locations:view`, but the handler allows only the Super Admin | **Fixed** in API (e0290b0); nav item with the Admin portal |
| BUG-QA-006 | Low | Resident app | Resending the code within 60 s shows the wrong message | Fixed on `claude/resident-app-0932e5` (e539651), not merged yet |
| BUG-QA-007 | Low | Admin web | Employees list renders a stray "0" when there are no readiness gaps | Suspected (code read) |
| BUG-QA-008 | Low | Admin web | Demand cycle form keeps plan ids from an older catalogue, so saving fails | Suspected (code read) |
| BUG-QA-009 | Low | Admin web | A package price of 0 is marked invalid but still saved as "not offered" | Suspected (code read) |
| BUG-QA-010 | Low | Admin web | Payments: approving a refund leaves "Needs review" stale; the tabs lack `role="tab"` | Suspected (code read) |
| BUG-QA-011 | Low | Admin web | Invite admin opens with "Specific clusters" selected and none ticked, so the form shows an error at once | Suspected (code read) |
| BUG-QA-012 | **High** | API payments | Review H-3: a webhook whose processing failed is answered 200 and never retried | Open |
| BUG-QA-013 | **High** | API payments | Review H-7: reconciliation re-polls the same 50 open orders (no ORDER BY, no last-checked marker) | Open |
| BUG-QA-014 | **High** | API payments | Review H-2: a verified payment is rolled back with no record when its business effect throws | Open |
| BUG-QA-015 | Medium | API attendance | Review M-17: check-in locks only the occurrence, so a just-replaced worker can still check in | Open |
| BUG-QA-016 | Medium | DB grants | Review M-2: payment amounts, provider evidence and approved payroll lines are writable/deletable by the API role | Open |
| BUG-QA-017 | Medium | API payroll | Review M-2 race: a payroll entry can be added to a run being submitted (run row not locked) | Open |

---

## BUG-QA-003 (High): an unsigned webhook can pre-empt the genuine event
- **Test:** `apps/api/test/integration/pay-rules.test.ts` → "PAY-09/10: an unsigned event cannot pre-empt the genuine event with the same id (BUG-QA-003)" (`it.fails`)
- **Steps:**
  1. Anyone sends `POST /v1/webhooks/razorpay` with an invalid signature and the header `x-razorpay-event-id: E`. With no header, the id defaults to `payment.captured:<payment id>`, which is easy to guess once the payment id is known.
  2. Razorpay then delivers the real, correctly signed event with id `E`.
- **Expected:** the forged request is rejected and leaves no trace that matters. The genuine event is processed and the request becomes COMMITTED.
- **Actual:** the forged request is inserted into `app.provider_events` with `signature_valid = false`. The genuine event then hits `onConflict(event_id).doNothing()` and returns `'duplicate'`, so it is never processed. Only the checkout callback or the reconciliation job can still settle the payment. Refund webhooks (`refund.processed`) can be suppressed the same way.
- **Suspected:** `apps/api/src/modules/bookings/payments.ts:313-325` (`handleWebhook`).
- **Fix ideas:**
  - Return `'rejected'` before inserting when the signature is invalid, or store invalid attempts in a separate table.
  - Or make the dedupe key `(event_id) where signature_valid`, for example with a partial unique index (a migration).

## BUG-QA-004 (High for web, none on native): Resident sign-in never finishes on Expo web
- **Test:** `apps/resident/e2e/sign-in.spec.ts` (mocked sign-in, expected failure)
- **Steps:** on the Expo web build, enter a phone number, then a valid OTP, then tap "Verify and continue".
- **Expected:** Home opens.
- **Actual:** the button spins forever.
  - Saving the session calls `SecureStore.setItemAsync`, but the web build of expo-secure-store is an empty module, so it throws a TypeError.
  - supabase-js re-throws it, and `verify()` has no try/finally.
- **Suspected:**
  - `apps/resident/src/lib/supabase.ts:18` (also :23 and :40): needs a web storage adapter.
  - `apps/resident/src/app/sign-in.tsx:34-35`: needs a try/finally.
- **Also blocking web E2E:** `apps/resident` has no `react-native-web` / `react-dom`, so `expo export --platform web` fails. Fix with `npx expo install react-native-web react-dom`.

## BUG-QA-005 (Medium): tapping a push opens the app, not the related screen
- **Test:** `apps/resident/.maestro/push_notification_tap.yaml` (tagged `known-gap`)
- **Steps:** receive a push such as `booking.confirmed`, then tap it.
- **Expected:** the related screen opens.
- **Actual:** only the app opens.
  - The API sends `data.eventType` (`apps/api/src/modules/notifications/service.ts:183`).
  - `apps/resident/src/lib/push.ts` only registers the token; there is no `addNotificationResponseReceivedListener` or `useLastNotificationResponse` handler.

## BUG-QA-001 (Low): `POST /v1/admin/holidays` validates before authorising
- **Test:** `apps/api/test/unit/route-authz-matrix.test.ts` → "403 for an admin with no grants › POST /holidays" (`it.fails`)
- **Steps:** as an admin with no grants, `POST /v1/admin/holidays` with `{}`.
- **Expected:** 403, as every other route does.
- **Actual:** 422 with field errors, which reveals the schema to an admin who is not authorised.
- **Suspected:** `apps/api/src/modules/support/routes.ts:66`. `validateBody` runs before the in-handler `isSuperAdmin` check. A `superAdminOnly` middleware placed before `validateBody` would fix it.

## BUG-QA-002 (Low): expansion votes guard does not match the workflow
- **Test:** `apps/api/test/unit/route-authz-matrix.test.ts` → "authZ passes with only the required grant › GET /expansion-votes with locations:view" (`it.fails`)
- **Workflow:** ADM-03A says Super Admin only.
- **Actual:**
  - The route is guarded by `authorize('locations', 'view')`, and the service then refuses anyone who is not the Super Admin.
  - So a role granted `locations:view` sees the menu item and then gets a 403.
- **Suspected:** `apps/api/src/modules/locations/routes.ts:109`.
- **Fix:** make the route Super-Admin-only, as the outbox and audit routes are, and hide the nav item in `apps/web` for everyone else. Then move the test case to `ADMIN_UNGUARDED` as `super-only`.

## BUG-QA-006 (Low): wrong message when resending within 60 s
- **Test:** `apps/resident/e2e/sign-in.spec.ts` (expected failure)
- **Expected:** "Too many attempts. Please wait a minute…"
- **Actual:** "We could not send the code."
  - Supabase answers 429 "For security purposes, you can only request this after N seconds.", which does not contain "rate".
  - The app only checks `err.message.includes('rate')`.
- **Suspected:** `apps/resident/src/app/sign-in.tsx:26`. Check `status === 429` instead.

## Architecture review findings reproduced (BUG-QA-012…017)
All are kept as `it.fails`. None of these tests writes money or payroll data:
- the unit tests run the real services on an in-memory scripted Kysely driver (`apps/api/test/helpers/scripted-db.ts`) that records every statement;
- the M-2 grants test only reads the catalogue.

Full evidence and fixes are in the review: `docs/reviews/2026-11-system-review.md` on `claude/arch-review-b0d127`.

- **BUG-QA-012 (H-3).** Test: `apps/api/test/unit/review-findings.test.ts` → "H-3".
  - Steps: processing throws once (a transient DB error), then the provider retries with the same event id.
  - Expected: either the first answer is non-2xx so Razorpay retries, or the retry is processed again.
  - Actual: the first answer is `'ok'` (200) and the retry is `'duplicate'`, so the event is never processed.
  - Suspected: `apps/api/src/modules/bookings/payments.ts` `handleWebhook` (insert `on conflict do nothing`, plus the catch that stores `processing_error` and returns `'ok'`).
- **BUG-QA-013 (H-7).** Test: same file → "H-7".
  - The reconciliation select has no `ORDER BY` and nothing records `last_checked_at`, so the same physical-first 50 orders are polled every minute.
  - Suspected: `payments.ts` `maintenance()` (reconciliation block).
- **BUG-QA-014 (H-2).** Test: same file → "H-2".
  - Steps: `applyPurpose` throws a unique violation (`subscriptions_one_renewal`, reachable through a double renewal).
  - Expected: `REVIEW_REQUIRED`, a `payment_exceptions` row, and the transaction committed.
  - Actual: `settle` rethrows and the whole transaction, including the `payment_transactions` row, rolls back.
  - Suspected: `payments.ts` `settle()`, where `applyPurpose` is called without a savepoint.
  - The renewal race itself (`renew()` with no lock) needs real bookings, so it is not reproduced here.
- **BUG-QA-015 (M-17).** Test: same file → "M-17".
  - The check-in visit lookup ends with `for update of "o"`, so the joined ACTIVE assignment is not locked.
  - Suspected: `apps/api/src/modules/attendance/service.ts` `assignedVisit()` (`.forUpdate('o')`).
  - A true two-connection race test needs bookings and subscriptions as fixtures, which counts as commercial data. It is deferred until writing that data is allowed.
- **BUG-QA-016 (M-2).** Test: `apps/api/test/integration/money-immutability.test.ts`, which is read-only.
  - `app_api` can UPDATE `payment_transactions.amount_paise`, `provider_payment_id`, `order_id` and `currency`.
  - It can also UPDATE `provider_events.payload`, `signature_valid` and `event_id`.
  - It can DELETE `payroll_lines` and `payroll_line_items`, and no trigger freezes approved lines.
- **BUG-QA-017 (M-2 race).** Test: `review-findings.test.ts` → "M-2 race".
  - `lineInRun` ends with `for update of "l"`, so `r.status` is read unlocked. `addItem` can therefore commit into a run that `submit` has just moved to `IN_REVIEW`.
  - Suspected: `apps/api/src/modules/payroll/service.ts` `lineInRun()`.

## Suspected admin web issues (found by reading code; confirm when E2E credentials exist)
- **BUG-QA-007:** `apps/web/src/admin/pages/workforce/EmployeesPage.tsx:194`. `{e.readinessGaps.length && …}` renders "0".
- **BUG-QA-008:** `apps/web/src/admin/pages/demand/CyclesPage.tsx` (about lines 77 and 129).
  - After the catalogue is republished, the old `planIds` stay selected with no checkbox to clear them.
  - Saving then fails with "Choose plans from the community’s published catalogue".
- **BUG-QA-009:** `apps/web/src/admin/pages/setup/PricesStep.tsx` (lines 50, 60–61, 176). A price of 0 is flagged but not counted as an error, so Save stays enabled and the cell is dropped.
- **BUG-QA-010:** `apps/web/src/admin/pages/demand/PaymentsPage.tsx:226`.
  - After a refund, only the payments list refreshes.
  - The tabs are buttons inside a `role="tablist"` with no `role="tab"`.
- **BUG-QA-011:** Invite admin modal (`apps/web/src/admin/pages/access/AdminsPage.tsx`). The default scope shows an error before the user does anything.
- **Also noted:**
  - Payroll "Export CSV" (`apps/web/src/admin/pages/finance/PayrollPage.tsx:155`) has no busy state or error handling.
  - An INVITED admin has neither "Disable" nor "Re-enable" on `AdminDetailPage`.

## Fixed

- **BUG-QA-001, -002, -003:** fixed on `gaps-before-apps` in e0290b0 and merged into the QA branch. Their tests are plain `it` again and pass. BUG-QA-002 still needs the Admin portal to hide the nav item.
