# Third-party integrations: how to switch them on

Every integration is built in and stays **off until its keys are set**. Add the values to `apps/api/.env` (never commit it) and restart the API. On start-up the API logs one `integrations` line showing what is live, for example:

```
integrations {"razorpay":true,"razorpayWebhooks":true,"smsOtp":true,"push":true,"email":true,"maps":true}
```

The placeholders already exist in `apps/api/.env`. `apps/api/.env.example` documents them.

| Service | What it powers | Keys in `apps/api/.env` | One-time setup in the provider |
|---|---|---|---|
| **Supabase** | Database, sign-in (admins, residents, workers), document storage | `DATABASE_URL`, `DATABASE_ADMIN_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (already set) | Nothing more |
| **Razorpay** | Resident payments: initial, balance, full, renewal; refunds | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Dashboard → Webhooks: URL `https://<api-host>/v1/webhooks/razorpay`, events `payment.captured`, `order.paid`, `refund.processed`, and the same secret. Use test keys (`rzp_test_…`) in dev |
| **MSG91 + Supabase SMS hook** | Resident phone OTP sign-in | `MSG91_AUTH_KEY`, `MSG91_OTP_TEMPLATE_ID`, `MSG91_OTP_VARIABLE` (variable name in the template, default `otp`), `SUPABASE_SMS_HOOK_SECRET` | 1. MSG91: register the DLT sender ID and an OTP template (for example `Your Nestovin code is ##otp##`) and copy the template ID. 2. Supabase → Authentication → Sign In / Providers → enable **Phone**. 3. Supabase → Authentication → Hooks → **Send SMS hook** → HTTPS → URL `https://<api-host>/v1/hooks/supabase/send-sms` → generate a secret and paste it into `SUPABASE_SMS_HOOK_SECRET`. Until then, use Supabase **test phone numbers** (Auth → Phone → Test OTPs) |
| **Firebase Cloud Messaging** | Push notifications to the Resident and Worker apps (the in-app inbox works without it) | `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` (keep the `\n` escapes, wrapped in quotes) | Firebase Console → Project settings → Service accounts → Generate new private key. For iOS, upload the APNs key in Firebase. The apps also need `google-services.json` / `GoogleService-Info.plist` (see the app READMEs) |
| **Resend** | Emails: escalated tickets to admins, website enquiries to Support | `RESEND_API_KEY`, `EMAIL_FROM` (for example `Nestovin <no-reply@nestovin.in>`) | Verify the sending domain in Resend. Optionally use Resend as Supabase's custom SMTP for admin invite emails (Supabase → Auth → SMTP) |
| **Google Maps** | "Find address on map" for community reference pins (attendance distance check) | `GOOGLE_MAPS_API_KEY` (server-side, Geocoding API) | Google Cloud → enable the **Geocoding API**, restrict the key by API (and by server IP in production) |
| **Support inbox** | Destination for website enquiries | `SUPPORT_ENQUIRY_EMAIL` | Needs Resend to actually send |

## What happens when a key is missing
- **Razorpay:** residents see "Online payments are not available right now"; webhooks are refused.
- **SMS:** the Supabase hook answers 503, so OTPs can't be sent (use Supabase test numbers in dev).
- **Push:** notifications are still saved to the in-app inbox. The Super Admin's *Notification delivery* page shows "In-app only".
- **Email:** email rows are marked *skipped*.
- **Maps:** "Find address on map" explains that the coordinates can be entered manually.

## Mobile apps
The Resident and Worker apps only need public values (Supabase URL, publishable key, API URL, Razorpay key ID). They live in each app's `.env` as `EXPO_PUBLIC_*` variables. Secrets never go into the apps.
