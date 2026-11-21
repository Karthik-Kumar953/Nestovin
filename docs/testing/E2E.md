# Running the Playwright E2E suites

Each suite runs with one command from the repo root. Playwright starts the dev servers it needs, or reuses ones already running.

| Suite | Command | Needs |
|---|---|---|
| Admin portal (`apps/web/e2e`) | `corepack pnpm e2e:admin` | API `.env` and web `.env.local` in place; test Super Admin credentials for the signed-in specs |
| Resident app, Expo web (`apps/resident/e2e`) | `corepack pnpm e2e:resident-web` | `react-native-web` in `apps/resident`; see `MOBILE_TESTING.md` |
| Everything Playwright knows about | `corepack pnpm e2e` | as above (resident-web is included only with `E2E_RESIDENT_WEB=1`) |

First run on a machine: `npx playwright install chromium`.

## Credentials (never committed)
Create the git-ignored file `e2e/.env.e2e` at the repo root:

```
E2E_ADMIN_EMAIL=...
E2E_ADMIN_PASSWORD=...
E2E_ADMIN_TOTP_SECRET=...   # base32 secret of the admin's verified TOTP factor
# optional
E2E_WEB_URL=http://localhost:3000
E2E_API_URL=http://localhost:4000
E2E_ALLOW_SHARED_WRITES=1   # enables payroll approval (irreversible on the shared dev DB)
```

- Use a dedicated test Super Admin created by the lead, never a person's account.
- Its TOTP factor must already be enrolled and verified with that secret. The setup project generates the 6-digit code itself (`apps/web/e2e/support/totp.ts`).
- Without credentials:
  - only the signed-out specs run: sign-in page, wrong password, redirects, forgot password and the invite-expired page;
  - every other spec skips with "E2E admin credentials missing: see docs/testing/E2E.md".

## How it is built
- **Sign-in once.** `apps/web/e2e/auth.setup.ts` signs in with password and TOTP, then saves the session to `e2e/.auth/admin.json` (git-ignored). The `admin` project reuses that session.
- **Test data.** Every record a spec creates is named `E2E-<runid> …`, so runs never collide and leftovers are easy to find. Holidays use the years 2090 and later and are removed afterwards.
- **Opt-in specs.** Specs that need data only the mobile apps can create (paid bookings, real residents, worker check-ins) skip with the reason. Payroll approval is opt-in (`E2E_ALLOW_SHARED_WRITES=1`).
- **Failures.** Traces are kept on the first retry and screenshots on failure, both in `test-results/`.

## Reading results
- `corepack pnpm e2e:admin --reporter=html`, then `npx playwright show-report`.
- Known product bugs are listed in `BUGS.md`, and the latest run summary is in `TEST_RESULTS.md`.
