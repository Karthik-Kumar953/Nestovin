# Nestovin Resident app

Expo SDK 58, React Native, TypeScript and Expo Router (`src/app`). It talks only to the Nestovin API, plus Supabase for phone sign-in and the signed document upload.

## Run it
1. `apps/resident/.env` holds the public values (copy `.env.example` if it is missing):
   - `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: same project as the admin.
   - `EXPO_PUBLIC_API_URL`: an address the phone can reach. Use your computer's LAN IP (`http://192.168.x.x:4000`), `http://10.0.2.2:4000` for the Android emulator, or the staging URL.
2. Start the API (`corepack pnpm dev:api`). Add your LAN address to `CORS_ORIGINS` only if you use the web preview.
3. `cd apps/resident && npx expo start`. Scan the QR code with a **development build** (see below) or Expo Go.

## Sign-in during development
Phone OTP comes from Supabase Auth through the MSG91 hook (see `docs/integrations.md`). Until MSG91 and DLT are live, add **test phone numbers** in Supabase → Authentication → Phone → Test OTPs and sign in with those.

## What needs a development build (not Expo Go)
- **Payments:** `react-native-razorpay` is a native module. In Expo Go the app saves the booking and shows "Payments need the Nestovin app build".
- **Push notifications:** these use the native FCM/APNs token. The in-app *Updates* inbox works everywhere.

Build once and reinstall only when native modules change:
```
npx eas-cli@latest build --profile development --platform android
```
(or `npx expo run:android` with Android Studio installed).

## Firebase (push)
1. Firebase Console → add an Android app with package `in.nestovin.resident` (and an iOS app with bundle ID `in.nestovin.resident`, plus the APNs key).
2. Download `google-services.json` (and `GoogleService-Info.plist`) into `apps/resident/`.
3. In `app.json`, set `expo.android.googleServicesFile` (and `expo.ios.googleServicesFile`) to those files, then rebuild.
4. Put the Firebase service-account keys in `apps/api/.env` (`FCM_*`) so the API can send.

## Screens
- **Sign in:** phone, then OTP.
- **Home:** residence status, next visits, updates.
- **Register:** city → community → tower → flat, owner or tenant, one proof document (PDF, JPEG or PNG under 5 MB) sent straight to private storage.
- **Book:** plans for your flat's category.
  - Demand-led: join an open cycle with preferred times; accept the non-refundable terms; pay the initial % now.
  - Continuous: pick a slot and a start date (tomorrow up to 14 days ahead); pay in full.
- **Bookings:** status, balance due and deadline, pay again, renew.
- **Visits:** upcoming and recent visits; a check-in code (6 digits plus QR, 10 minutes, single use) to show the worker; ratings.
- **Support:** tickets shared with the household, replies.
- **Profile:** name and email; household, family requests (Primary only), occupancy change or move-out requests; notification inbox; sign out.

## Checks
```
npx tsc --noEmit
npx expo-doctor
npx expo export --platform android   # full Metro bundle
```
