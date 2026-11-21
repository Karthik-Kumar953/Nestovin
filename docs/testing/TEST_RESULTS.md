# Test results summary

Latest run: 21 Nov 2026 by the QA session.

- **Branch:** `claude/qa-tests-7e2388`. It includes `gaps-before-apps` up to 5046085.
- **Machine:** Windows 11, Node 24.
- **Database:** the shared dev Supabase project.

| Suite | Command (repo root) | Pass | Fail | Expected fail (open bug) | Skipped |
|---|---|---|---|---|---|
| API unit | `corepack pnpm --filter @nestovin/api test` | 1299 | 0 | 2 (BUG-QA-015 M-17, BUG-QA-017 M-2 race) | 0 |
| API integration | `corepack pnpm --filter @nestovin/api test:integration` | 131 | 0 | 3 (BUG-QA-016 M-2 grants) | 0 |
| Admin E2E (Playwright, signed in) | `corepack pnpm e2e:admin` | 80 | 0 | 0 | 24 by design |
| Resident demo mode (Playwright) | `corepack pnpm e2e:resident-demo` * | 63 | 0 | 1 (BUG-QA-025) | 0 |
| Resident web, mocked auth (Playwright, sign-in + guard) | `corepack pnpm e2e:resident-web` * | 31 | 0 | 0 | signed-in specs skip without a test phone |
| Maestro (native) | `maestro test apps/resident/.maestro` | — | — | — | not run yet |

\* Until the resident branch is merged, set `E2E_RESIDENT_APP_DIR=<resident-app worktree>/apps/resident`. See `MOBILE_TESTING.md`.

## Notes

**API integration**
- 19 files took 32 minutes against the shared database.
- Every suite now removes its own fixtures. QA suites use `Fixtures.cleanup()` and the older suites use `cleanupSuite()`. Cleanup runs last in `afterAll`, with a 3-minute timeout.
- After the run, no temporary required checklist item was left active.
- Run one integration suite per database at a time. See `TEST_STRATEGY.md` → "Running integration suites against the shared dev database".

**Review findings**
- H-2, H-3 and H-7 are fixed on `gaps-before-apps`, and their tests are now plain assertions.
- M-17, M-2 (grants) and the M-2 payroll race are still open.
- None of these tests writes money or payroll data.

**Admin E2E**
- **Paused:** the signed-in admin specs are paused until the owner confirms the E2E Super Admin. I deleted my copy of its credentials, so they skip again. The 80 / 24 figures above are from the last run while the credentials were present.
- **Ports:** the suite runs on its own ports (API 4200, web 3200).
- **Why specs skip:** most of the 24 skipped specs need data only the mobile apps create. Payroll approval only runs when opted in.

**Resident specs**
- Both projects ran against `claude/resident-app-0932e5` at d8911fa, after the BUG-QA-019…024 fixes. Demo mode needs no API and no sign-in, and the web specs mock Supabase and the API. Nothing is written to dev.

**Maestro**
- The flows are checked against the current app code, and all 28 YAML files pass a static check.
- They wait for Maestro to be installed and the shared emulator to be free (`MOBILE_TESTING.md`).

**Windows**
- An occasional Vitest worker crash (exit 3221226505) goes away on a single rerun.

## Bugs
See `BUGS.md` for every bug's steps, expected vs actual, suspected file:line and test.

| Status | Bugs |
|---|---|
| Fixed and merged | 001, 002, 003, 012, 013, 014 |
| Fixed on the resident branch, merge pending | 004, 005, 006, 019–024 |
| Open, API | 015 (M-17), 016 (M-2 grants), 017 (M-2 race) |
| Open, Resident app | 025 (tab names include an icon glyph on web; a11y) |
| Open, Worker app | 018 (push tap re-navigates; found by reading code) |
| Suspected, admin web (found by reading code) | 007–011 |
