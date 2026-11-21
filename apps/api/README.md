# @nestovin/api

Express 5 modular monolith (Kysely + Zod contracts from `@nestovin/contracts`). Configuration is
validated at boot in `src/config/env.ts`; see `.env.example` for every key.

## Demo mode (development only)

Two switches make the product demo-able end to end without Razorpay or SMS. **Never enable them in
production** — the API refuses to start if either is `true` with `NODE_ENV=production`.

### Test payments — `TEST_PAYMENTS_ENABLED=true`

- Applies only while `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` are unset. A built-in test provider
  creates `test_order_…` orders; signatures use a random secret generated at boot.
- `GET /v1/resident/test-mode` → `{ testPayments: boolean }`: the Resident app shows a
  "Test booking" button only when this is `true`.
- `POST /v1/resident/payments/test-complete` with `{ paymentOrderId }` (the resident's own open
  order) fabricates a captured payment for exactly the order amount (`test_pay_…`) and runs the same
  verification and settlement as `POST /v1/resident/payments/verify`: bookings, demand requests,
  subscriptions, notifications and audit behave as for a real payment. Answers 404 when disabled.
- Test transactions are recognisable in Admin → Payments by the `test_pay_` provider payment id.

### Resident demo login — `DEMO_LOGIN_ENABLED=true` + `DEMO_RESIDENT_PHONE=+919999900001`

Supabase has no SMS provider in development, so phone OTP cannot be used.

1. Seed the demo data with the same phone: `DEMO_RESIDENT_PHONE=+919999900001 corepack pnpm --filter @nestovin/api seed:dev-demo`
   (the first demo household, Ananya Rao, gets this number).
2. Start the API with `DEMO_LOGIN_ENABLED=true` and `DEMO_RESIDENT_PHONE` set.
3. The Resident app calls `POST /v1/public/demo-login` (rate-limited per IP, audited). The API gives
   the demo resident's auth user a confirmed internal alias `demo-resident@nestovin.invalid` and
   returns only a magic-link token hash: `{ tokenHash, type: 'magiclink' }`.
4. The app calls `supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })` and gets a
   normal Supabase session for that resident; every resident route then works unchanged.

If the demo resident or its auth user is missing, the route answers 409 asking you to run the seed.
When disabled it answers 404.
