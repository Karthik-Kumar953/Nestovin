# Nestovin Worker app

Expo SDK 58, React Native 0.88, TypeScript (strict), Expo Router (`src/app`), NativeWind 4.2 with the Nestovin tokens as the Tailwind theme, TanStack Query, Reanimated 4. Package `@nestovin/employee`, bundle and package ID `in.nestovin.employee`, scheme `nestovin-worker`, display name "Nestovin Worker". English only (ADR-012), light mode only.

It talks only to the Nestovin API (`/v1/employee/*`, `/v1/public/applicants`), plus Supabase Auth for the Employee ID sign-in.

## Run it
1. `apps/employee/.env` holds the public values (copy `.env.example` if it is missing; they are the same as the Resident app's):
   - `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `EXPO_PUBLIC_API_URL`: an address the phone can reach. Use your computer's LAN IP (`http://192.168.x.x:4000`), `http://10.0.2.2:4000` for the Android emulator, or the staging URL.
2. Start the API (`corepack pnpm dev:api`).
3. `cd apps/employee && npx expo start`, then open it in a **development build** (see below) or Expo Go.

On Windows, Expo commands that call pnpm need a shim folder with `pnpm` / `pnpm.cmd` running `corepack pnpm` on PATH (see `docs/team/TEAM_PLAN.md`).

## Sign-in during development
1. An admin with `employees:approve` enables the worker's login in the admin portal (or `POST /v1/admin/employees/:id/login`). HR sees a one-time temporary password.
2. Sign in with the Employee ID (`NV-000123`; `nv123` and `123` also work) and that password. The app maps it to `nv-000123@staff.nestovin.invalid` in Supabase Auth.
3. The app then asks for a new password (at least 8 characters, letters and a number) and calls `POST /v1/employee/me/password-changed`.

To test check-in, the worker needs a visit **today** with status `ASSIGNED`, and the resident must open "Show check-in code" for that visit in the Resident app (6 digits plus QR, 10 minutes, single use).

## What needs a development build (not Expo Go)
- **Push notifications** (native FCM/APNs token). The in-app *Updates* inbox works everywhere.
- **Liquid Glass** native tabs and the glass floating action need iOS 26 in a build; older iOS falls back to solid surfaces.

```
npx eas-cli@latest build --profile development --platform android
```

## Screens
- **Welcome** (signed out): sign in, or apply.
- **Apply** (public, EMP-01) and its confirmation. Submitting never creates a login.
- **Sign in** (Employee ID + password) and **set your own password** (first login, ADR-012).
- **Today**: greeting, day stats, the next visit as the hero (flat, time window, service photo, one action: Check in or Complete), extra-work banner, the day's timeline, quick links. Workers who are not READY see their readiness, checks and training progress instead.
- **Visit**: details, status, check-in evidence, and the actions allowed now.
- **Check in** (EMP-06, ADR-014): the resident's 6-digit code or their QR (expo-camera), one location reading with its accuracy, then a clear result: verified, flagged for review (outside the community radius or low accuracy, never blocked), or rejected with the reason. Retries of the same attempt reuse its `clientEventId`.
- **Complete visit** with an optional note (EMP-07); **Resident not available** after the waiting time; **Request a correction** (ADM-12A).
- **Schedule**: week strip, the day's visits, your working hours.
- **Extra work** (EMP-08): accept or decline; acceptance is not an assignment until Operations confirms.
- **Leave** (EMP-09): list, request with a date-range calendar, cancel while pending.
- **Training** (EMP-04): open the video link, then mark it watched.
- **Payslips**: approved months with payable days, earnings, deductions, net and paid status.
- **Updates** (EMP-10): inbox with deep links; push taps open the same screen.
- **Me**: Employee ID, phone, services, checks, working hours, links, sign out.

## Images
Images are referenced by their `docs/Design/Image_Shot_List.md` names through `src/assets/images.ts`. After the owner adds files to `docs/Design/images/`, run:
```
node scripts/sync-images.cjs
```
It copies them into `assets/images/` and regenerates `src/assets/images.generated.ts`. A missing image shows a designed fallback (brand gradient, rings and icon).

## Shared UI
`src/ui/` holds local copies of the building blocks (buttons, fields, cards, pills, motion, glass action). When `packages/ui-native` lands, swap the imports; names match on purpose.

## Checks
```
npx tsc --noEmit
corepack pnpm exec eslint apps/employee/src   # from the repo root
npx expo-doctor
npx expo export --platform android
```
