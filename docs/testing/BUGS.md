# Known bugs found by the test suites

Each bug has a test that is kept in the suite as an expected failure (`it.fails`) or a skip pointing here. When the lead fixes a bug, the test starts "unexpectedly passing": flip it to a normal `it` and move the entry to "Fixed".

Severity: **High** = money, data leak or broken core flow; **Medium** = wrong behaviour with a workaround; **Low** = inconsistency or information leak with no data exposure.

## Open

### BUG-QA-001 (Low): `POST /v1/admin/holidays` validates the body before the Super Admin check
- **Test:** `apps/api/test/unit/route-authz-matrix.test.ts` → "admin routes: 403 for an admin with no grants › POST /holidays" (`it.fails`)
- **Steps:** as an active admin with no grants, `POST /v1/admin/holidays` with body `{}`.
- **Expected:** `403 FORBIDDEN` (authorisation is decided before validation everywhere else).
- **Actual:** `422 VALIDATION_FAILED` with the field errors, so an unauthorised admin learns the schema.
- **Suspected:** `apps/api/src/modules/support/routes.ts:66` — `validateBody(holidaySchema)` runs before the in-handler `isSuperAdmin` check. Same pattern on `DELETE /holidays/:date` (line 70) is fine because it has no body. Fix: a `superAdminOnly` middleware placed before `validateBody`.

### BUG-QA-002 (Low): `GET /v1/admin/expansion-votes` is guarded by `locations:view` but refuses everyone except the Super Admin
- **Test:** `apps/api/test/unit/route-authz-matrix.test.ts` → "admin routes: authZ passes with only the required grant › GET /expansion-votes with locations:view" (`it.fails`)
- **Steps:** as an admin whose role grants `locations:view`, open Locations → Expansion votes (`GET /v1/admin/expansion-votes`).
- **Expected:** either the list (the route's declared grant), or the route declared Super-Admin-only so the portal hides the menu item.
- **Actual:** `403 "Only the Super Admin can review expansion votes"`; the role sees the page in navigation and then gets an error.
- **Suspected:** `apps/api/src/modules/locations/routes.ts:109` and `LocationService.voteAggregates` (in `apps/api/src/modules/locations/service.ts`). Owner decision needed: who may review expansion votes? Then align the guard, the service check and `apps/web` navigation.

## Fixed

_None yet._
