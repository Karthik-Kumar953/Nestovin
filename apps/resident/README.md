# Nestovin Resident app

Expo SDK 58, React Native 0.88, TypeScript and Expo Router (`src/app`). Styling is NativeWind 4 with the Nestovin tokens; shared building blocks live in `packages/ui-native`. It talks only to the Nestovin API, plus Supabase for phone sign-in and the signed document upload.

## Run it
1. `apps/resident/.env` holds the public values (copy `.env.example` if it is missing):
   - `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: same project as the admin.
   - `EXPO_PUBLIC_API_URL`: an address the phone can reach. Use your computer's LAN IP (`http://192.168.x.x:4000`), `http://10.0.2.2:4000` for the Android emulator, or the staging URL.
2. Start the API (`corepack pnpm dev:api`). Add your LAN address to `CORS_ORIGINS` only if you use the web preview.
3. `cd apps/resident && npx expo start`. Scan the QR code with a **development build** (see below) or Expo Go.

## Design review without the API (demo mode, dev only)
```
node scripts/demo-web.cjs        # or the "resident-demo" entry in .claude/launch.json
```
This runs the app on web at http://localhost:8081 with fixtures from `src/lib/demo.ts`: no API and no sign-in. Add `?demo=new` or `?demo=pending` to see the other Home states.
- It is gated on `__DEV__ && EXPO_PUBLIC_DEMO=1`, so a release build never serves fixtures.
- Plan names and prices in the fixtures are placeholders, not the catalogue.
- On a phone, set `EXPO_PUBLIC_DEMO=1` before `npx expo start` to see the same data.

## Images
Photos and illustrations come from `docs/Design/Image_Shot_List.md`. When the owner adds files to `docs/Design/images/`, run:
```
corepack pnpm --filter @nestovin/resident images
```
This copies the shot-list files into `assets/images/` and rewrites `src/assets/images.generated.ts`. Every image is looked up by its shot-list name through `src/assets/images.ts`. A missing file shows a designed fallback (brand gradient, rings and an icon), never a broken image.

## Sign-in during development
Phone OTP comes from Supabase Auth through the MSG91 hook (see `docs/integrations.md`). Until MSG91 and DLT are live, add **test phone numbers** in Supabase → Authentication → Phone → Test OTPs and sign in with those.

## What needs a development build (not Expo Go)
- **Payments:** `react-native-razorpay` is a native module. In Expo Go the booking is still created, and the result screen says "Pay in the Nestovin app build". The resident can pay later from the booking.
- **Push notifications:** these use the native FCM/APNs token. The in-app *Updates* inbox works everywhere.
- **Liquid Glass:** iOS 26 only; other devices get the solid fallback.

Build once and reinstall only when native modules change:
```
npx eas-cli@latest build --profile development --platform android
```
(or `npx expo run:android` with Android Studio installed).

## Device checklist (needs a real phone or an iOS build)
These cannot be checked on Windows, in a browser or on the Android emulator. Tick them on a development build before a demo.

**iOS 26 (iPhone), Liquid Glass**
- [ ] The tab bar is system glass, minimises when you scroll down, and shows SF Symbols (house, plus square, calendar, chat bubbles, person).
- [ ] "Show check-in code" on Home and Visits is a full-width glass capsule with a teal tint above the tab bar, and it does not cover the last list item.
- [ ] The compact header that appears when you scroll a screen is glass; the text under it stays readable.
- [ ] Cards, lists, sheets, banners and the check-in code are never glass (solid white).

**iOS: Reduce Transparency on** (Settings → Accessibility → Display & Text Size)
- [ ] The floating action and the compact header turn solid (white, or solid teal for the action) with a hairline border, and switch live without restarting the app.
- [ ] Text contrast on those surfaces stays at least 4.5:1.

**iOS 18 or earlier**
- [ ] Same solid fallback as above (no glass API), no crash.

**Reduce Motion on** (iOS: Accessibility → Motion; Android: Remove animations)
- [ ] Lists, cards and screens crossfade in instead of sliding.
- [ ] Buttons and cards dim slightly on press instead of scaling.
- [ ] The payment success mark and the check-in digits appear in their final state at once.
- [ ] The shimmer on loading skeletons is off.

**Haptics (physical phone only)**
- [ ] Light tap on buttons and cards; a selection tick on choice tiles, filter chips, dates and stars.
- [ ] Success on a verified payment, when the check-in code appears, and when a rating, request or vote is sent.
- [ ] Error on a wrong code or a failed payment.
- [ ] On Android 13+, CONFIRM and REJECT feel distinct from a plain tap.

**Push (development build with Firebase configured)**
- [ ] Tapping a push while the app runs, and the tap that launches a closed app, both open the related screen (booking, ticket, household) once, not twice.
- [ ] A push received while the app is open updates the Updates badge on Home.

**Payments (development build, Razorpay test keys)**
- [ ] Checkout opens, test card succeeds → animated "confirmed" or "joined" screen; cancelling → "Payment not completed"; the booking shows the right status after each.

## Firebase (push)
1. Firebase Console → add an Android app with package `in.nestovin.resident` (and an iOS app with bundle ID `in.nestovin.resident`, plus the APNs key).
2. Download `google-services.json` (and `GoogleService-Info.plist`) into `apps/resident/`.
3. In `app.json`, set `expo.android.googleServicesFile` (and `expo.ios.googleServicesFile`) to those files, then rebuild.
4. Put the Firebase service-account keys in `apps/api/.env` (`FCM_*`) so the API can send.

## Screens
- **Sign in:** phone, then a 6-digit code with SMS autofill and a resend timer.
- **Home:** three states.
  - Not registered: what Nestovin is and the three steps. A rejection goes straight back to the proof step.
  - Under review: status timeline. A failed upload offers "Upload document again".
  - Active: Today card (visit, assigned worker, check-in action), payments due, coming up, services, community.
- **Register:** flat (city → community → tower → flat, searchable sheets) → owner or tenant → one proof document (PDF, JPEG or PNG under 5 MB, sent straight to private storage). `/register?step=proof` reopens the proof step.
- **Book:** membership-style plan cards for your flat's category. Not-open states: not registered, under review, community not live, no pricing category, no open round, offline.
  - Plan detail: package or one service, what is included, add-ons, payment conditions.
  - Booking round: up to three preferred times in order, the non-refundable terms accepted, pay the configured initial %.
  - Continuous: pick a slot and a start date (tomorrow up to 14 days ahead), pay in full.
  - Payment result: animated outcome for paid, joined, processing, review, failed, cancelled, and the Expo Go case.
- **Bookings:** current and past, booking-round requests kept separate. **Booking detail** shows a timeline, amounts, agreed terms, and pay, renew, cancel or help.
- **Visits:** upcoming by day; history by month with "Load earlier" (12 months).
  - Visit detail: what happened, plus rating.
  - Check-in code: 6 digits plus QR, revealed with motion, countdown, new code.
- **Support:** open and closed requests; new request (can be prefilled from a booking or visit); thread with replies.
- **Updates:** grouped inbox. Every update opens its screen, and so does tapping a push notification.
- **Profile:** details (edit sheet), household, residence changes, bookings, updates, support, sign out.
  - Household: members, family requests (Primary only), residence changes.
  - Change residence: owner or tenant, or move-out with the native date picker.

## API pieces the app relies on (added for the redesign)
- `booking-options.reasonCode` and `communityName`: the "booking not open" states.
- `POST /v1/resident/residence/document`: re-upload for a PENDING registration whose upload failed.
- `me.verification.flat`: prefills the proof step after a rejection (`src/lib/residence.ts`).
- `GET /v1/resident/bookings/:id`: agreed terms and payment history on booking detail.

Not available: worker photos. Visit cards show initials until photo storage exists.

## Checks
```
npx tsc --noEmit
npx eslint .                          # from the repo root: npx eslint apps/resident packages/ui-native
npx expo-doctor
npx expo export --platform android    # full Metro bundle
```
