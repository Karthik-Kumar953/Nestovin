# Mobile app testing (Resident and Worker apps)

There are two layers:

| Layer | Tool | Where | What it covers |
|---|---|---|---|
| Expo web build | Playwright (`resident-web` project) | `apps/resident/e2e/*.spec.ts` | Screen logic, validation, navigation and API wiring that does not need a native module |
| Native app on Android | Maestro | `apps/resident/.maestro/`, `apps/employee/.maestro/` | Razorpay Checkout, push notifications, camera/QR, location, OS permission dialogs, real phone OTP on device |

Credentials always come from environment variables. Never commit them, and never put them in a flow or spec.

| Variable | Used by | Notes |
|---|---|---|
| `E2E_RESIDENT_PHONE` | web + Maestro | A Supabase **test phone number** (Authentication -> Phone -> Test OTPs). 10 digits or `+91...` |
| `E2E_RESIDENT_OTP` | web + Maestro | The fixed OTP configured for that test number |
| `E2E_RESIDENT_ALLOW_WRITES` | web | `1` lets specs create data (a support ticket, a family request). Off by default |
| `E2E_RESIDENT_WEB_AUTH` | web | `1` turns on the signed-in web specs. Leave it off until web sign-in works (see known issues) |
| `E2E_PAYMENT_EMAIL` | Maestro payments | Only typed if Razorpay Checkout asks for an email |
| `E2E_EMPLOYEE_ID`, `E2E_EMPLOYEE_PASSWORD` | Maestro worker | A test employee enabled by HR in the test project |
| `E2E_PUSH_TITLE`, `E2E_PUSH_EXPECT` | Maestro push | Notification title to tap and text expected on the screen it opens |

## 1. Expo web + Playwright

### One-time setup (owner: resident-app session)

The Resident app does not build for web yet. `npx expo export --platform web` in `apps/resident` fails with:

```
CommandError: It looks like you're trying to use web support but don't have the required
dependencies installed.

Install react-native-web@^0.21.4 by running:

npx expo install react-native-web
```

Fix (application dependency change, so it belongs to the resident-app session):

```
cd apps/resident
npx expo install react-native-web react-dom
```

Then install the Playwright browser once from the repo root: `corepack pnpm exec playwright install chromium`.

For the signed-in specs the API must also accept the web origin: add `http://localhost:8081` to `CORS_ORIGINS` in `apps/api/.env` and start the API (`corepack pnpm dev:api`).

### Playwright project

Paste this project into the root `playwright.config.ts` (the file is owned by the testing harness; the `admin` project lives there too):

```ts
// residentWebProject: Resident app (Expo web build). Specs: apps/resident/e2e.
// Add to `projects`:
{
  name: 'resident-web',
  testDir: './apps/resident/e2e',
  fullyParallel: false, // signed-in specs share one Supabase test phone (60 s OTP resend limit)
  use: {
    ...devices['Pixel 7'],            // phone-sized viewport, touch
    baseURL: process.env.E2E_RESIDENT_WEB_URL ?? 'http://localhost:8081',
  },
},
// Add to `webServer` (an array if the admin project also has one):
{
  command: 'corepack pnpm --filter @nestovin/resident exec expo start --web --port 8081',
  url: 'http://localhost:8081',
  reuseExistingServer: !process.env.CI,
  timeout: 180_000,                     // first Metro web bundle is slow
  env: { CI: '1', BROWSER: 'none' },    // non-interactive, do not open a browser tab
},
```

### Run (one command)

```
corepack pnpm exec playwright test --project=resident-web --workers=1
```

Signed-in specs (only after web sign-in is fixed):

```
E2E_RESIDENT_PHONE=9xxxxxxxxx E2E_RESIDENT_OTP=123456 E2E_RESIDENT_WEB_AUTH=1 corepack pnpm exec playwright test --project=resident-web --workers=1
```

The root config also loads the git-ignored `e2e/.env.e2e`, so the `E2E_RESIDENT_*` values can live there instead. In PowerShell set them first: `$env:E2E_RESIDENT_PHONE='9xxxxxxxxx'; $env:E2E_RESIDENT_OTP='123456'; $env:E2E_RESIDENT_WEB_AUTH='1'`.

Without credentials the signed-in files are skipped with the reason printed in the report. The unauthenticated specs (`sign-in.spec.ts`, `auth-guard.spec.ts`) mock Supabase Auth with `page.route`, so they send no SMS and need no API.

Selectors follow the app's real accessibility props: `Field` inputs have `accessibilityLabel={label}` (-> `getByLabel`), buttons and pressable cards have `accessibilityRole="button"`, `Choice` options are `radio` with `aria-checked`, headings are `heading`, error banners are `alert`.

## 2. Maestro on an Android emulator (Windows)

### Install

1. **Java 17+**: `java -version` (the Android Studio JBR works).
2. **Android Studio** with SDK Platform-Tools and the Emulator. Put `%LOCALAPPDATA%\Android\Sdk\platform-tools` and `...\Sdk\emulator` on `PATH`. Set `ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk`.
3. **Maestro CLI**: Maestro has no native Windows installer script. Either
   - download `maestro.zip` from the latest GitHub release (`mobile-dev-inc/maestro`), unzip to `C:\maestro`, and add `C:\maestro\bin` to `PATH`; or
   - run `curl -Ls "https://get.maestro.mobile.dev" | bash` inside WSL2 and connect WSL's `adb` to the Windows emulator.
   Check with `maestro --version`.

### Create an emulator (AVD)

Android Studio -> Device Manager -> Create device -> Pixel 7 -> a **Google Play** or **Google APIs** image, API 34 or 35 (Google services are needed for FCM push). Or from the command line:

```
sdkmanager "system-images;android-35;google_apis_playstore;x86_64"
avdmanager create avd -n nestovin_api35 -k "system-images;android-35;google_apis_playstore;x86_64" -d pixel_7
emulator -avd nestovin_api35
```

For the Worker QR flow, set the AVD back camera to **VirtualScene** or **Webcam0** (AVD -> Edit -> Advanced settings -> Camera).

### Install a development build

Razorpay (`react-native-razorpay`) and FCM push are native, so Expo Go is not enough.

```
cd apps/resident
# apps/resident/.env: EXPO_PUBLIC_API_URL=http://10.0.2.2:4000 for the emulator
npx expo run:android            # builds android/ (CNG) and installs in.nestovin.resident
# or: npx eas-cli@latest build --profile development --platform android, then adb install the .apk
```

Keep Metro running (`npx expo start --dev-client`) while the flows run, and start the API (`corepack pnpm dev:api`) with Razorpay **test** keys (`rzp_test_...`).

The Worker app (`apps/employee`) is built the same way once its branch lands; update `appId` in `apps/employee/.maestro/**` from the placeholder `in.nestovin.employee` to the value in its `app.json`.

### Run

```
maestro test apps/resident/.maestro -e E2E_RESIDENT_PHONE=9xxxxxxxxx -e E2E_RESIDENT_OTP=123456
maestro test apps/resident/.maestro --include-tags=smoke -e ...
maestro test apps/resident/.maestro/razorpay_test_payment_upi.yaml -e E2E_RESIDENT_PHONE=... -e E2E_RESIDENT_OTP=... -e E2E_PAYMENT_EMAIL=qa@example.com
maestro test apps/employee/.maestro -e E2E_EMPLOYEE_ID=... -e E2E_EMPLOYEE_PASSWORD=...
maestro studio      # inspect the hierarchy and refine selectors
```

`config.yaml` in each folder runs every top-level flow; `subflows/` holds reusable steps. Flows tagged `needs-trigger` (push) and `manual-assist` (camera QR) are excluded by default; run them by file name.

Razorpay test mode values used by the payment subflows are Razorpay's published test values: UPI `success@razorpay`; card `4111 1111 1111 1111`, any future expiry, any CVV, then **Success** on the simulated bank page.

## 3. Flow coverage: web or native

### Resident app

| Flow (module) | Where it is tested | Why |
|---|---|---|
| Sign in: phone entry and validation (RES-01) | Web `sign-in.spec.ts`; Maestro `sign_in_validation.yaml` | Pure JS validation; Supabase mocked on web |
| Sign in: OTP step, wrong/expired code, change number (RES-01) | Web `sign-in.spec.ts` | Mocked Supabase responses; repeatable without SMS |
| Sign in with a real test phone, session restore, sign out (RES-01) | Maestro `sign_in_phone_otp.yaml` (web `signIn()` helper once fixed) | Session is stored with expo-secure-store, which has no web build |
| Signed-out guard on every route | Web `auth-guard.spec.ts` | Router logic only |
| Home residence state (RES-02/03) | Web `onboarding.spec.ts` | API data only |
| Register flat: city -> community -> tower -> flat -> owner/tenant (RES-03) | Web `onboarding.spec.ts` | Pickers are plain radios |
| Register: proof document upload (RES-03) | Native, manual for now | expo-document-picker / expo-image-picker camera open OS pickers |
| Interest vote (RES-02A) | Web `onboarding.spec.ts` | Form only |
| Catalogue, plan and service choice, demand-led and continuous forms (RES-06/07/08) | Web `booking.spec.ts` | Stops before payment |
| Razorpay payment success (UPI, card) and cancel (RES-08/09) | Maestro `razorpay_test_payment_upi.yaml`, `razorpay_test_payment_card.yaml`, `razorpay_cancel.yaml` | `react-native-razorpay` is a native SDK; on web/Expo Go the app shows "Payments need the Nestovin app build" |
| Bookings and payments list (RES-09) | Web `booking.spec.ts` | API data only |
| Household, family request validation, move-out and owner/tenant requests (RES-04/05/14) | Web `household.spec.ts` | Forms only |
| Support tickets: create, reply, back (RES-12) | Web `support.spec.ts` | Forms only; creating data needs `E2E_RESIDENT_ALLOW_WRITES=1` |
| Visits list and check-in code with QR (RES-10/11) | Web `visits-updates-profile.spec.ts`; Maestro `visit_check_in_code.yaml` | QR renders through react-native-svg, which works on web |
| In-app updates inbox (RES-13) | Web `visits-updates-profile.spec.ts` | API data only |
| Push notification registration and tap -> right screen (RES-13) | Maestro `push_notification_tap.yaml` (`needs-trigger`, `known-gap`) | Needs FCM token on a device; tap handling is native |
| Profile edit and sign out (RES-14) | Web `visits-updates-profile.spec.ts`; Maestro `sign_in_phone_otp.yaml` | Form only |

### Worker app (skeleton until `apps/employee` lands)

| Flow (module) | Where it is tested | Why |
|---|---|---|
| Employee ID + password sign-in, first-login password change (EMP-02) | Maestro `employee_sign_in.yaml` | Worker app is mobile-only; web build not planned |
| Rejected sign-in: empty, wrong password, disabled ID (EMP-02) | Maestro `employee_sign_in_invalid.yaml` | Same |
| Attendance check-in with the resident's 6-digit code, both apps on one device (EMP-06) | Maestro `attendance_check_in_code.yaml` (`cross-app`) | Needs location permission and both native apps |
| Wrong or expired code rejected (EMP-06) | Maestro `attendance_check_in_invalid_code.yaml` | Same |
| Attendance check-in by scanning the QR (EMP-06) | Maestro `attendance_check_in_qr.yaml` (`manual-assist`) | Camera input; Maestro cannot inject frames, use AVD VirtualScene/Webcam0 |
| Push tap -> assignment/offer screen (EMP-10) | Maestro `push_notification_tap.yaml` (`needs-trigger`) | FCM on a device |

## 4. Known issues found while writing these tests

1. **Web build missing dependencies.** `react-native-web` and `react-dom` are not in `apps/resident/package.json`, so the `resident-web` project cannot start until they are added.
2. **Web sign-in cannot finish.** `src/lib/supabase.ts:18` stores the session key with `SecureStore.setItemAsync`; expo-secure-store's web build is an empty module, so `verifyOtp` throws a TypeError while saving the session. `src/app/sign-in.tsx:34-35` has no try/finally, so the button stays busy forever. The signed-in web specs stay skipped (`E2E_RESIDENT_WEB_AUTH`) and the mocked "successful verification opens Home" spec is marked as an expected failure.
3. **OTP resend rate limit shows the generic error.** `src/app/sign-in.tsx:26` only checks `err.message.includes('rate')`. Supabase's 60-second resend window answers 429 "For security purposes, you can only request this after N seconds.", so the user sees "We could not send the code" instead of the wait message. Covered by an expected-failure spec.
4. **Push tap does not open the related screen.** The API sends `data.eventType` with each push, but the app registers no notification response handler (`addNotificationResponseReceivedListener` / `useLastNotificationResponse`), so tapping a push only opens the app. `push_notification_tap.yaml` is tagged `known-gap`.
5. **No testIDs.** Inputs are found by accessibility label plus `index: 1` in Maestro, because the label Text and the input share the same text. Adding `testID` to `Field` would make the flows sturdier.
