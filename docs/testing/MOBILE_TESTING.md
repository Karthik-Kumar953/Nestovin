# Mobile app testing (Resident and Worker apps)

There are two layers:

| Layer | Tool | Where | What it covers |
|---|---|---|---|
| Expo web build | Playwright (`resident-web`, `resident-demo` projects) | `apps/resident/e2e/**` | Screen logic, validation, navigation and API wiring that does not need a native module |
| Native app on Android | Maestro | `apps/resident/.maestro/`, `apps/employee/.maestro/` | Razorpay Checkout, push notifications, camera/QR, location, OS permission dialogs, real phone OTP on a device |

Credentials always come from environment variables. Never commit them, and never put them in a flow or spec. Phone numbers are **Supabase test phone numbers** (Authentication -> Providers -> Phone -> Test phone numbers and OTPs), never a real person's number. Payment instruments are **Razorpay test-mode values** only.

| Variable | Used by | Notes |
|---|---|---|
| `E2E_RESIDENT_APP_DIR` | Playwright | Which `apps/resident` to serve. Until the resident branch is merged: `D:/Karthik/Karthik/Projects/Nestovin/.claude/worktrees/resident-app-0932e5/apps/resident` |
| `E2E_RESIDENT_PHONE` | web + Maestro | A Supabase test phone number, 10 digits (e.g. `9000000001`) or `+91...` |
| `E2E_RESIDENT_OTP` | web + Maestro | The fixed OTP configured for that test number |
| `E2E_RESIDENT_ALLOW_WRITES` | web | `1` lets specs create data (a support ticket, a family request). Off by default |
| `E2E_RESIDENT_WEB_AUTH` | web | `1` turns on the signed-in web specs |
| `E2E_PAYMENT_EMAIL` | Maestro payments | Typed only if Razorpay Checkout asks for an email (e.g. `qa@example.com`) |
| `E2E_EMPLOYEE_ID`, `E2E_EMPLOYEE_PASSWORD` | Maestro worker | A test employee with login enabled by HR in the test project, e.g. `NV-000123` |
| `E2E_EMPLOYEE_NEW_PASSWORD` | Maestro worker | Only if that employee still has an HR temporary password (first login forces a change). Afterwards it becomes `E2E_EMPLOYEE_PASSWORD` |
| `E2E_PUSH_TITLE`, `E2E_PUSH_EXPECT` | Maestro push | Optional. Default to the representative event of each push flow (see "Triggering a push") |

Flow-internal values (set by the flows themselves, no need to pass them): `RZP_TEST_VPA` (`success@razorpay` or `failure@razorpay`), `CHECK_IN_CODE`.

## 1. Expo web + Playwright

Both Resident projects serve the app themselves from `E2E_RESIDENT_APP_DIR`, on their own ports, so they never touch a developer's `:8081` (that port belongs to the resident-app session).

| Project | Port | Specs | Command |
|---|---|---|---|
| `resident-web` | `:8092` | `apps/resident/e2e/*.spec.ts` (mocked Supabase + signed-in specs) | `corepack pnpm e2e:resident-web` |
| `resident-demo` | `:8091` | `apps/resident/e2e/demo/**` (demo mode, `EXPO_PUBLIC_DEMO=1`, no backend) | `corepack pnpm e2e:resident-demo` |

PowerShell, from the repo root (until the resident branch is merged):

```powershell
$env:E2E_RESIDENT_APP_DIR = 'D:/Karthik/Karthik/Projects/Nestovin/.claude/worktrees/resident-app-0932e5/apps/resident'
corepack pnpm exec playwright install chromium   # once
corepack pnpm e2e:resident-demo
corepack pnpm e2e:resident-web
```

Signed-in `resident-web` specs also need the API (`corepack pnpm dev:api`, with `http://localhost:8092` in `CORS_ORIGINS`) and:

```powershell
$env:E2E_RESIDENT_PHONE = '9000000001'; $env:E2E_RESIDENT_OTP = '123456'; $env:E2E_RESIDENT_WEB_AUTH = '1'
corepack pnpm e2e:resident-web
```

The root config also loads the git-ignored `e2e/.env.e2e`, so these values can live there instead. Without credentials the signed-in files are skipped with the reason in the report. The unauthenticated specs mock Supabase Auth with `page.route`, so they send no SMS.

## 2. Maestro on an Android emulator (Windows runbook)

> **Status:** every flow below is written against the current app source and passes a static check (YAML parses, commands and selector keys are valid Maestro, `runFlow` paths exist, regexes compile, env vars are `${VAR}`). **None has been run on a device yet.**
>
> The emulator on the QA machine is currently used by the resident-app session. Do not start, install on or run flows against it while that session is active; use a second AVD (below) or wait until it is free.

### 2.1 Install (once)

1. **Java 17+** (`java -version`). Android Studio's bundled JBR works: `$env:JAVA_HOME = "$env:ProgramFiles\Android\Android Studio\jbr"`.
2. **Android Studio** with *Android SDK Platform-Tools*, *Android Emulator* and *Android SDK Command-line Tools*. Then, in PowerShell (persist them in System -> Environment Variables):
   ```powershell
   $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
   $env:Path += ";$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:ANDROID_HOME\cmdline-tools\latest\bin"
   adb version
   ```
3. **Maestro CLI** (official release build):
   ```powershell
   # Download maestro.zip from https://github.com/mobile-dev-inc/maestro/releases/latest
   Expand-Archive "$env:USERPROFILE\Downloads\maestro.zip" -DestinationPath C:\
   $env:Path += ";C:\maestro\bin"
   maestro --version
   ```
   WSL alternative: inside WSL2 run `curl -fsSL "https://get.maestro.mobile.dev" | bash`, then make WSL use the Windows emulator: on Windows `adb -a nodaemon server start`, in WSL `export ADB_SERVER_SOCKET=tcp:$(ip route | awk '/default/ {print $3}'):5037`. Paths in commands then start with `/mnt/d/...`.

### 2.2 Create a Pixel AVD with Google APIs

Google APIs (or Google Play) images include Google Play services, which FCM push needs.

```powershell
sdkmanager "system-images;android-35;google_apis;x86_64"
avdmanager create avd -n nestovin_qa_api35 -k "system-images;android-35;google_apis;x86_64" -d pixel_7
emulator -avd nestovin_qa_api35
adb devices        # one emulator-5554 line
```

For the Worker QR flow, set the AVD back camera to **VirtualScene** or **Webcam0** (Device Manager -> Edit -> Advanced settings -> Camera). For attendance location, set Extended controls -> Location to a point inside the test community.

### 2.3 Build and install a development build

Razorpay (`react-native-razorpay`) and FCM are native, so Expo Go is not enough. From the Resident app folder (until the merge: the resident worktree's `apps/resident`):

```powershell
cd apps/resident
# apps/resident/.env (git-ignored):
#   EXPO_PUBLIC_API_URL=http://10.0.2.2:4000          # the host machine as seen from the emulator
#   EXPO_PUBLIC_SUPABASE_URL=... / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...   (test project)
# google-services.json in apps/resident for push (FCM); not needed for the other flows.
npx expo run:android          # builds android/ and installs in.nestovin.resident on the running emulator
```

Keep Metro running while flows run (`npx expo start --dev-client`), and start the API (`corepack pnpm dev:api`) with Razorpay **test** keys (`rzp_test_...`).

Worker app, the same way from `apps/employee` (installs `in.nestovin.employee`).

**Demo mode (preferred for data-dependent screens).** `EXPO_PUBLIC_DEMO=1` makes a development build serve fixtures (`src/lib/demo.ts`), already signed in, with no API or Supabase. It is read when Metro bundles, so the same installed dev build switches by restarting Metro:

```powershell
$env:EXPO_PUBLIC_DEMO = '1'; npx expo start --dev-client --clear      # demo
Remove-Item Env:EXPO_PUBLIC_DEMO; npx expo start --dev-client --clear # live
```

Demo mode skips Razorpay (it reports "paid" at once) and sign-in, so payment, sign-in and push flows need the live build. Flows that pass on a demo build are tagged `demo-ok`.

### 2.4 Set the variables

PowerShell, then pass them with `-e`:

```powershell
$env:E2E_RESIDENT_PHONE = '9000000001'    # Supabase test number, never a real person
$env:E2E_RESIDENT_OTP = '123456'          # its fixed OTP
$env:E2E_PAYMENT_EMAIL = 'qa@example.com'
$env:E2E_EMPLOYEE_ID = 'NV-000123'
$env:E2E_EMPLOYEE_PASSWORD = '...'
$R = "-e E2E_RESIDENT_PHONE=$env:E2E_RESIDENT_PHONE -e E2E_RESIDENT_OTP=$env:E2E_RESIDENT_OTP -e E2E_PAYMENT_EMAIL=$env:E2E_PAYMENT_EMAIL".Split(' ')
$W = "-e E2E_EMPLOYEE_ID=$env:E2E_EMPLOYEE_ID -e E2E_EMPLOYEE_PASSWORD=$env:E2E_EMPLOYEE_PASSWORD".Split(' ')
```

### 2.5 Run

From the repo root:

```powershell
# one flow
maestro test apps/resident/.maestro/sign_in_validation.yaml
maestro test apps/resident/.maestro/razorpay_test_payment_upi.yaml @R

# everything (config.yaml picks the flows and excludes needs-trigger)
maestro test apps/resident/.maestro @R
maestro test apps/employee/.maestro @W @R      # @R for the cross-app flow

# demo build
maestro test apps/resident/.maestro --include-tags=demo-ok
maestro test apps/employee/.maestro --include-tags=demo-ok
maestro test apps/employee/.maestro/attendance_check_in_demo.yaml

# reports
maestro test apps/resident/.maestro @R --format junit --output build/maestro/resident-junit.xml
maestro test apps/resident/.maestro @R --format html --output build/maestro/resident.html

maestro studio      # inspect the live hierarchy and refine selectors
```

**Where results land:** the console summary; the `--output` file for JUnit/HTML; and per-run logs, the view hierarchy and failure screenshots under `%USERPROFILE%\.maestro\tests\<date_time>\` (or the folder given with `--debug-output`).

### 2.6 Tags

| Tag | Meaning | Default run |
|---|---|---|
| `smoke` | Fast checks to run first | included |
| `auth`, `payments`, `visits`, `attendance`, `push` | Feature area | included |
| `live` | Needs a live development build: test API, Supabase test phone / test employee, Razorpay test keys | included |
| `demo-ok` | Also passes on a demo build (`EXPO_PUBLIC_DEMO=1`) | included |
| `demo-only` | Only meaningful on a demo build (`attendance_check_in_demo.yaml`) | excluded (run by file) |
| `native-only` | Needs native modules (Razorpay, FCM, camera); impossible in Expo Go or on web | included |
| `cross-app` | Drives both apps on one device | included (worker folder) |
| `needs-trigger` | Waits for something sent from outside the device (a push) | excluded (run by file) |
| `manual-assist` | Needs a person or a camera source (QR scan) | excluded (run by file) |
| `known-gap` | Behaviour not yet confirmed on a device. **The tag is removed after the flow's first green run on a dev build.** | follows its other tags |

### 2.7 Triggering a push

The push flows background the app, open the notification shade and wait up to 2 minutes for the title. While they wait, send a real event to the test user through the test API (FCM must be configured: `google-services.json` in the app, `FCM_*` in `apps/api/.env`, notifications allowed):

- **Resident** (`push_notification_tap.yaml`, representative event `ticket.replied`): from `/admin`, post a public reply on one of the test resident's support tickets. Push title "Reply from Nestovin Support"; the tap must open that ticket (the flow asserts the "Send reply" composer). For another event, pass e.g. `-e E2E_PUSH_TITLE="Family member approved" -e E2E_PUSH_EXPECT=Household` (mapping: `src/lib/deeplinks.ts`).
- **Worker** (`push_notification_tap.yaml`, representative event `overtime.offered`): from `/admin`, offer overtime to the test employee. Title "Additional work offered"; the tap must open "Extra work" (mapping: `src/lib/links.ts`).
- **Without the Admin portal:** send an FCM HTTP v1 message to the device token stored by `POST /v1/resident/devices`, with the same `notification.title` and `data` `{ "eventType": "ticket.replied", "ticketId": "<uuid>" }`, using a service-account token for the test Firebase project.
- `adb shell cmd notification post ...` is **not** a substitute: that notification belongs to the shell, not the app, carries no `eventType`, and never reaches expo-notifications.

```powershell
maestro test apps/resident/.maestro/push_notification_tap.yaml @R
```

### 2.8 Flows

| Flow | What it proves | Prerequisites | Status |
|---|---|---|---|
| resident `sign_in_validation` | Empty and short numbers are rejected with "Enter a 10-digit mobile number, for example 98765 43210"; no code step, no SMS | Live build (signed out after `clearState`) | ready, not yet run |
| resident `sign_in_phone_otp` | Test phone + fixed OTP signs in (auto-verify on the 6th digit), tab bar shows, Profile -> Sign out -> confirm returns to sign-in | Live build, `E2E_RESIDENT_PHONE`, `E2E_RESIDENT_OTP` | ready, not yet run |
| resident `visit_check_in_code` | Visits -> "Show check-in code" shows a 6-digit code, the QR, a countdown, and closes with Done | Live: a visit today with a worker assigned. Or demo build | ready, not yet run |
| resident `razorpay_test_payment_upi` | Pay a pending booking/request with `success@razorpay`; the app shows its success screen (server-verified) | Live build, Razorpay test keys, a payable booking or request | ready, not yet run |
| resident `razorpay_test_payment_upi_failure` | `failure@razorpay` leaves it unpaid; app shows "Payment not completed", "Not paid", "Try again" | Same | ready, not yet run |
| resident `razorpay_test_payment_card` | Pay with test card 4111 1111 1111 1111 + simulated bank "Success"; app success screen | Same | ready, not yet run |
| resident `razorpay_cancel` | Closing Checkout shows "Payment not completed ... No money was taken"; "Try again" reopens the payable booking | Same | ready, not yet run |
| resident `push_notification_tap` | A `ticket.replied` push tap opens that ticket (BUG-QA-005 fix) | Live build with FCM, a trigger (2.7) | ready, not yet run (`known-gap`) |
| worker `employee_sign_in_invalid` | Empty/malformed Employee ID and wrong password are rejected with the app's messages | Live build | ready, not yet run |
| worker `employee_sign_in` | Employee ID + password (and forced first-login change) lands on Today with the 4 tabs | Live build, `E2E_EMPLOYEE_ID`, `E2E_EMPLOYEE_PASSWORD` | ready, not yet run |
| worker `attendance_check_in_invalid_code` | Code 000000 gives "Check-in not accepted" and no check-in | Live: an ASSIGNED visit today. Or demo build | ready, not yet run |
| worker `attendance_check_in_demo` | Today -> Check in -> code -> "You are checked in" -> Done -> "Checked in at ..." | Demo build only | ready, not yet run |
| worker `attendance_check_in_code` | The resident's real code checks the worker in, both apps on one device | Both live builds, a shared ASSIGNED visit today, emulator location in the community | ready, not yet run |
| worker `attendance_check_in_qr` | Scanning the resident's QR checks the worker in | Live build + AVD camera source (VirtualScene/Webcam0) | ready, not yet run (`manual-assist`) |
| worker `employee_push_notification_tap` | An `overtime.offered` push tap opens "Extra work" | Live build with FCM, a trigger (2.7) | ready, not yet run (`known-gap`) |

Razorpay values used are Razorpay's published **test-mode** instruments only: UPI `success@razorpay` / `failure@razorpay`; card `4111 1111 1111 1111`, any future expiry, any CVV, then **Success** on the simulated bank page. The flows stop on the app's own result screen (`src/app/(app)/payment-result.tsx`) and assert it.

### 2.9 Selectors

Neither app sets `testID` yet, so flows use, in order: accessibility labels (e.g. booking cards "<plan>, <selection>, Awaiting payment", the check-in code "Code 4 8 2 9 1 5", the hidden OTP input "Verification code, 6 digits"), then exact visible text. `Field` inputs share their label with the label `Text`, so inputs are tapped by placeholder where one exists ("98765 43210", "NV-000123") or by label with `index: 1`. Recommended testIDs for the app owners (would make these flows robust to copy changes):

| Where | testID | Replaces |
|---|---|---|
| `packages/ui-native` `Field` (pass through to `TextInput`) | `phone-input`, `employee-id-input`, `password-input` | placeholder / `index: 1` taps |
| `packages/ui-native` `OtpInput` hidden `TextInput` | `otp-input` | "Verification code, 6 digits" |
| Resident `check-in/[id].tsx` code row | `check-in-code` | "Code \d \d ..." label regex |
| Resident `bookings/[id].tsx` pay buttons | `pay-button` | "Pay (balance )?₹..." regex |
| Resident `bookings/index.tsx` cards | `booking-card` (+ status in label) | status-label regex on the card |
| Resident `payment-result.tsx` result block | `payment-result-<state>` | four success titles regex |
| Resident `profile.tsx` sign-out row | `sign-out` | "Sign out" + dialog `below` |
| Worker `sign-in.tsx` footer button | `sign-in-button` | "Sign in" `below` the HR hint (title shares the text) |
| Worker `check-in.tsx` `CodeInput`, method tabs, result panel | `check-in-code-input`, `method-otp`, `method-qr`, `check-in-result` | label regexes |
| Worker `components/visit.tsx` Check in button | `visit-check-in` | "Check in" text |

## 3. Flow coverage: web or native

### Resident app

| Flow (module) | Where it is tested | Why |
|---|---|---|
| Sign in: phone entry and validation (RES-01) | Web `sign-in.spec.ts`; Maestro `sign_in_validation.yaml` | Pure JS validation; Supabase mocked on web |
| Sign in: OTP step, wrong/expired code, resend limit ("Too many attempts. Please wait N seconds, then send a new code."), change number (RES-01) | Web `sign-in.spec.ts` | Mocked Supabase responses; repeatable without SMS |
| Sign in with a real test phone, session restore, sign out (RES-01/14) | Maestro `sign_in_phone_otp.yaml` | Session is stored with expo-secure-store |
| Signed-out guard on every route | Web `auth-guard.spec.ts` | Router logic only |
| Home residence state, register flat, interest vote (RES-02/03/02A) | Web `onboarding.spec.ts` | API data and forms |
| Register: proof document upload (RES-03) | Native, manual for now | OS document/camera pickers |
| Catalogue, plan and service choice (RES-06/07/08) | Web `booking.spec.ts` | Stops before payment |
| Razorpay payment success (UPI, card), failure and cancel (RES-08/09) | Maestro `razorpay_*.yaml` | Native SDK; web/Expo Go show "Pay in the Nestovin app build" |
| Bookings and payments list (RES-09) | Web `booking.spec.ts` | API data only |
| Household, family requests, change requests (RES-04/05/14) | Web `household.spec.ts` | Forms only |
| Support tickets (RES-12) | Web `support.spec.ts` | Forms only; writes need `E2E_RESIDENT_ALLOW_WRITES=1` |
| Visits and check-in code with QR (RES-10/11) | Web `visits-updates-profile.spec.ts`; Maestro `visit_check_in_code.yaml` | QR renders through react-native-svg |
| Demo-mode screens | Web `resident-demo` project; Maestro `--include-tags=demo-ok` | No backend needed |
| In-app updates inbox (RES-13) | Web `visits-updates-profile.spec.ts` | API data only |
| Push registration and tap -> right screen (RES-13) | Maestro `push_notification_tap.yaml` (`needs-trigger`, `known-gap`) | FCM token and tap handling are native |

### Worker app

| Flow (module) | Where it is tested | Why |
|---|---|---|
| Employee ID + password sign-in, first-login password change (EMP-02) | Maestro `employee_sign_in.yaml` | Worker app is mobile-only |
| Rejected sign-in (EMP-02) | Maestro `employee_sign_in_invalid.yaml` | Same |
| Check-in with the resident's code, both apps (EMP-06) | Maestro `attendance_check_in_code.yaml` (`cross-app`), `attendance_check_in_demo.yaml` (demo) | Location permission and both native apps |
| Wrong code rejected (EMP-06) | Maestro `attendance_check_in_invalid_code.yaml` | Same |
| Check-in by QR scan (EMP-06) | Maestro `attendance_check_in_qr.yaml` (`manual-assist`) | Camera input |
| Push tap -> offer/assignment screen (EMP-10) | Maestro `push_notification_tap.yaml` (`needs-trigger`, `known-gap`) | FCM on a device |

## 4. Known issues

1. **Push tap did not open the related screen (BUG-QA-005).** Fixed on the resident branch (`usePushNavigation` in `src/lib/push.ts`, mapping in `src/lib/deeplinks.ts`), pending merge. `push_notification_tap.yaml` keeps `known-gap` until its first green run.
2. **Worker push tap can re-navigate on session refresh.** Worker `src/app/_layout.tsx` `NotificationRouter` pushes `linkFor(last)` in an effect keyed on `[last, session]`, and `src/lib/auth.tsx` sets a new session object on every auth event (including token refresh). Expected: one navigation per tap; actual: the same screen is pushed again whenever the session object changes while `last` is unchanged. The resident app avoids this with a handled-id set.
3. **A failed Razorpay payment reads as "Payment not completed".** `src/lib/payments.ts` maps every Checkout rejection (user close or payment error) to `cancelled`; "Payment did not go through" only appears when the API reports FAILED/EXPIRED. The copy ("No money was taken") is still true, so this is a note, not a defect.
4. **No testIDs** in either app; see 2.9.
