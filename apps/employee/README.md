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

## On your iPhone with Expo Go

1. Check Expo Go: the app's settings must list **SDK 58** (this app uses Expo SDK 58). If it shows an older SDK, update Expo Go from the App Store.
2. Phone and computer on the same Wi-Fi. Start the API from the main checkout: `corepack pnpm dev:api`. The first time, allow Node.js on **Private networks** in the Windows firewall prompt.
3. `corepack pnpm --filter @nestovin/employee phone` (or `node scripts/phone.cjs` here). It finds this computer's Wi-Fi address, points the app at `http://<that address>:4000` and starts Metro on port 8082 for Expo Go. Your `.env` is not changed.
4. Scan the QR code with the iPhone Camera app; it opens in Expo Go.

If the phone cannot connect, pass the address yourself (`--host 192.168.x.x`) or use `--tunnel` (needs `npx expo login`; the API must still be reachable from the phone).

In Expo Go, push notifications are off by design (they need a development build); everything else works.

## Design review without the API (demo mode, dev only)
```
node scripts/demo-web.cjs        # or the "worker-demo" entry in .claude/launch.json
```
This runs the app on web at http://localhost:8082 with fixtures from `src/lib/demo.ts`: no API and no sign-in. Fixtures change as you use them (check in, complete, accept an offer, request or cancel leave, mark updates read) and reset on reload.
- Other states: add `?demo=live`, `done`, `empty`, `notready` or `signedout` to the URL.
- Check-in codes: `000000` is rejected, `111111` is verified but flagged for review, any other 6 digits is verified.
- It is gated on `__DEV__ && EXPO_PUBLIC_DEMO=1`, so a release build never serves fixtures. Names, flats and amounts are illustrative.
- On a phone, set `EXPO_PUBLIC_DEMO=1` before `npx expo start` to see the same data.

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

## Device checklist (needs a real phone or an iOS build)
These cannot be checked on Windows, in a browser or on the Android emulator. Tick them on a development build before a demo. Use the test worker from `seed:dev-demo` and a resident who can open the visit's check-in code in the Resident app.

**Check-in by QR (real camera)**
- [ ] First tap on "Scan QR" shows the system camera prompt with "Scan the resident's check-in QR code."
- [ ] Allow → live camera with the corner frame and scan line; the resident's QR checks in once, with no double submit while "Checking…" shows.
- [ ] Any other QR (a payment or website QR) shows "This is not a Nestovin check-in code" with an error haptic, and nothing is sent.
- [ ] Deny → "Allow the camera to scan" with "Allow camera"; after "Don't ask again", the button becomes "Open settings" and opens the app's settings.
- [ ] "Enter code" still works with the camera denied.

**Location permission and the denied path**
- [ ] Opening check-in shows the system location prompt once, with "Your location is recorded once, only when you check in to a visit."; there is no background-location prompt.
- [ ] Allowed → "Location ready · accurate to N m" appears before the code is entered.
- [ ] Denied, or location services off → the amber note "You can still check in; it will be reviewed", "Retry location" and "Settings"; check-in still succeeds and shows "Flagged for review".
- [ ] Indoors with a weak fix, the reading gives up after about 10 seconds and uses a recent last-known position; check-in is never blocked waiting for GPS.

**GPS accuracy flags (geofence 200 m per community)**
- [ ] Inside the community, a check-in shows "You are checked in" with no flags.
- [ ] More than 200 m from the community pin, it is still verified but shows "Flagged for review: You seemed to be outside the community's check-in area" with a warning haptic; Admin → Attendance lists it for review.
- [ ] The low-accuracy flag appears only after `gps_accuracy_threshold_m` is set (it is OPEN today), so don't expect it before that.
- [ ] Wrong code → "Check-in not accepted" with the reason; after 5 wrong codes, the resident must open a new code.
- [ ] Airplane mode during check-in → "Not sent yet"; turning it off re-sends the same attempt once automatically, and Admin shows one check-in, not two.

**VoiceOver (iOS) and TalkBack (Android): Today and check-in**
- [ ] Today reads the greeting as a heading, then "Visits today: 3", "Completed: 1/3", "Offers: 1" as single items.
- [ ] The hero card reads "Next visit: Cook, Flat B-0703 · Tower B, 9:00 am – 10:30 am", and "Check in" reads as a button with a hint.
- [ ] Each timeline row reads time, service, flat and status in one swipe; the decorative photos and rings are skipped.
- [ ] On check-in, "Enter code" and "Scan QR" read as tabs with the selected state; the code field reads the digits one by one.
- [ ] The result (verified, flagged, rejected, not sent) is announced without focus jumping, and "Done" / "Try again" is reachable next.
- [ ] Icon-only buttons (close, previous and next week, show password) have spoken names.

**Native font scale at 200%** (iOS: Larger Accessibility Sizes at the largest; Android: Font size max plus Display size)
- [ ] Today: the stats wrap into two columns, the timeline shows the time inside each card, task chips wrap inside the card, and nothing is cut off.
- [ ] Check-in: the tabs, location note and buttons wrap and stay tappable; the 6 code boxes keep their size (their digits do not scale).
- [ ] Schedule week strip and the leave calendar stay on one grid (their digits stop growing at 1.4×).
- [ ] Bold Text (iOS) does not clip any label.

**Reduce Motion on** (iOS: Accessibility → Motion; Android: Remove animations)
- [ ] Lists and cards appear without sliding; pushed screens crossfade instead of sliding.
- [ ] Buttons and cards dim on press instead of scaling.
- [ ] The check-in, completion and application result marks appear in their final state at once.
- [ ] The live dot on an in-progress visit, the skeleton shimmer and the QR scan line are still.

**Liquid Glass (iOS 26) and its fallbacks**
- [ ] The tab bar is system glass, minimises when you scroll down, and shows SF Symbols (sun, calendar, bell, person); the Updates tab shows an unread badge.
- [ ] "Check in" / "Complete visit" on a visit, and "Request leave" on Leave, are full-width glass capsules with a teal tint above the tab bar, and they don't cover the last item.
- [ ] Cards, lists, the code boxes, banners and forms are never glass.
- [ ] Reduce Transparency on (Accessibility → Display & Text Size): the floating actions switch live to a solid teal capsule with white text.
- [ ] iOS 18 or earlier: the same solid fallback, with no crash.
- [ ] Android: Material 3 tab bar with a mint indicator and labels always shown; the floating action is a right-aligned extended FAB with 16 dp corners.

**Haptics (physical phone only)**
- [ ] Selection tick on the check-in tabs, week days, service chips, correction choices, calendar days and payslip rows.
- [ ] Success on a verified check-in, completing a visit, accepting an offer, requesting or cancelling leave, setting the new password and sending the application.
- [ ] Warning on a flagged check-in; error on a wrong code, a wrong password and any failed send.
- [ ] On Android 13+, CONFIRM and REJECT feel distinct from a plain tap.

**Push taps to deep links (development build with Firebase configured)**
- [ ] After the first sign-in and password change, the app asks for notification permission once; the device is then registered for the worker.
- [ ] Tapping each push, both while the app runs and from a closed app, opens its screen once:
  - extra work offered → Extra work
  - leave decided → Leave
  - payslip available → Payslips
  - new regular work, a visit added or overtime confirmed → that visit, or Schedule
  - correction reviewed → that visit
  - anything else → Updates
- [ ] A push tap while signed out opens nothing until sign-in, and sign-out removes the device so a shared phone stops getting this worker's pushes.
- [ ] A push received while the app is open updates the Updates badge within a minute.

## Screens
- **Welcome** (signed out): sign in, or apply.
- **Apply** (public, EMP-01) and its confirmation. Submitting never creates a login.
- **Sign in** (Employee ID + password) and **set your own password** (first login, ADR-012).
- **Today**: greeting, day stats, the next visit as the hero (flat, time window, service photo, one action: Check in or Complete), extra-work banner, the day's timeline, quick links. Workers who are not READY see their readiness, checks and training progress instead.
- **Visit** (`GET /v1/employee/visits/:id`): time window and duration, what the plan covers (tasks from the booking terms snapshot), the check-in, completion, no-show and correction record, and only the actions allowed now.
- **Check in** (EMP-06, ADR-014): the resident's 6-digit code or their QR (expo-camera), one location reading with its accuracy, then a clear result: verified, flagged for review (outside the community radius or low accuracy, never blocked), or rejected with the reason. Retries of the same attempt reuse its `clientEventId`.
- **Complete visit** with an optional note (EMP-07); **Resident not available** after the waiting time; **Request a correction** (ADM-12A).
- **Schedule**: week strip, the day's visits, your working hours.
- **Extra work** (EMP-08): accept or decline; acceptance is not an assignment until Operations confirms.
- **Leave** (EMP-09): list, request with a date-range calendar, cancel while pending.
- **Training** (EMP-04): open the video link, then mark it watched.
- **Payslips**: approved months with payable days, earnings, deductions, net and paid status.
- **Updates** (EMP-10): virtualised inbox (FlashList) with deep links; push taps open the same screen.
- **Me**: Employee ID, phone, home cluster, joining date, services, checks, working hours, links, sign out.

## Images
Images are referenced by their `docs/Design/Image_Shot_List.md` names through `src/assets/images.ts`. After the owner adds files to `docs/Design/images/`, run:
```
node scripts/sync-images.cjs
```
It copies them into `assets/images/` and regenerates `src/assets/images.generated.ts`. A missing image shows a designed fallback (brand gradient, rings and icon).

## Styling rules (ADR-018)
NativeWind only styles core components. `Animated.*`, `GlassView`, expo-image and `LinearGradient` take `style` (token values), never `className`: wrap a plain `View` for layout classes. Primitives drop their default classes when a screen overrides them (`textClass` in `src/ui/primitives.tsx`).

## Shared UI
`src/ui/` holds local copies of the building blocks (buttons, fields, cards, pills, motion, glass action). When `packages/ui-native` lands, swap the imports; names match on purpose.

## Checks
```
npx tsc --noEmit
corepack pnpm exec eslint apps/employee/src   # from the repo root
npx expo-doctor
npx expo export --platform android
```
