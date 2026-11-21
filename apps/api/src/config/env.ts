import { z } from 'zod';

/** Optional variable where an empty value (e.g. `SUPABASE_JWT_SECRET=`) means "not set". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), schema.optional());

/**
 * Environment is validated once at boot. The process refuses to start with a
 * missing or unsafe configuration. Secrets are only ever read from the
 * environment (never committed; see .env.example).
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    /** Connection string for the restricted `app_api` role (through the pooler). */
    DATABASE_URL: z.url(),
    /**
     * Path to the Supabase database CA certificate (Dashboard -> Database -> SSL).
     * With it, TLS is fully verified. Required outside development/test.
     */
    DATABASE_SSL_CA_PATH: optional(z.string().min(1)),

    /** Supabase project URL, used for JWKS (token verification) and the auth admin adapter. */
    SUPABASE_URL: z.url(),
    /** Legacy HS256 JWT secret (local Supabase CLI). Optional when the project uses asymmetric keys (JWKS). */
    SUPABASE_JWT_SECRET: optional(z.string().min(32)),
    /** Service-role key. Used ONLY by the auth-admin adapter (invite/ban users). Never sent to clients. */
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

    /** Comma-separated browser origins allowed by CORS (the Next.js web app serving / and /admin). */
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),

    /** Admins must have completed TOTP MFA (AAL2). Only disable for automated local tests. */
    ADMIN_REQUIRE_MFA: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),

    /** Salt for hashing client IPs before storage (privacy). */
    IP_HASH_SALT: z.string().min(16),

    /** Where website enquiries are routed (email). Optional until the Support destination is approved. */
    SUPPORT_ENQUIRY_EMAIL: optional(z.email()),

    /** Razorpay (ADR-006). Without key id + secret, online payments are disabled (clear error to residents). */
    RAZORPAY_KEY_ID: optional(z.string().min(8)),
    RAZORPAY_KEY_SECRET: optional(z.string().min(8)),
    /** Webhook secret configured in the Razorpay dashboard; webhooks are rejected without it. */
    RAZORPAY_WEBHOOK_SECRET: optional(z.string().min(8)),
    /** Resident phone OTP: Supabase "Send SMS" hook secret (v1,whsec_...) + MSG91 DLT template. */
    SUPABASE_SMS_HOOK_SECRET: optional(z.string().min(20)),
    MSG91_AUTH_KEY: optional(z.string().min(10)),
    MSG91_OTP_TEMPLATE_ID: optional(z.string().min(5)),
    /** Variable name used for the OTP in the MSG91 template (default "otp"). */
    MSG91_OTP_VARIABLE: z.string().regex(/^[A-Za-z0-9_]{1,40}$/).default('otp'),
    /** Google Maps Geocoding (server-side) for community reference pins. */
    GOOGLE_MAPS_API_KEY: optional(z.string().min(20)),
    /** Firebase Cloud Messaging (service account). Without them, notifications stay in-app only. */
    FCM_PROJECT_ID: optional(z.string().min(3)),
    FCM_CLIENT_EMAIL: optional(z.email()),
    FCM_PRIVATE_KEY: optional(z.string().min(100)),
    /** Resend transactional email. Without it, email notifications are skipped. */
    RESEND_API_KEY: optional(z.string().min(10)),
    EMAIL_FROM: optional(z.string().min(5)),
    /** Periodic maintenance (reconciliation, expiry). Off in tests. */
    JOBS_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),

    /**
     * Dev-only demo payments: with no Razorpay keys, a built-in test provider is used and the
     * resident app may complete a payment as a test (POST /v1/resident/payments/test-complete).
     * The API refuses to start with this on in production.
     */
    TEST_PAYMENTS_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),

    /**
     * Dev-only Resident app demo login (POST /v1/public/demo-login): signs in as the seeded demo
     * resident with DEMO_RESIDENT_PHONE, without SMS. The API refuses to start with this on in production.
     */
    DEMO_LOGIN_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    DEMO_RESIDENT_PHONE: optional(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Use E.164, e.g. +919999900001')),

    /** Admin portal base URL (the /admin mount of the web app), used in invite emails. */
    ADMIN_PORTAL_URL: z.url().default('http://localhost:3000/admin'),
  })
  .superRefine((env, ctx) => {
    const strict = env.NODE_ENV === 'production' || env.NODE_ENV === 'staging';
    if (strict && !env.ADMIN_REQUIRE_MFA) {
      ctx.addIssue({ code: 'custom', path: ['ADMIN_REQUIRE_MFA'], message: 'MFA cannot be disabled outside development/test' });
    }
    if (env.NODE_ENV === 'production' && env.TEST_PAYMENTS_ENABLED) {
      ctx.addIssue({ code: 'custom', path: ['TEST_PAYMENTS_ENABLED'], message: 'Test payments can never be enabled in production' });
    }
    if (env.NODE_ENV === 'production' && env.DEMO_LOGIN_ENABLED) {
      ctx.addIssue({ code: 'custom', path: ['DEMO_LOGIN_ENABLED'], message: 'Demo login can never be enabled in production' });
    }
    if (env.DEMO_LOGIN_ENABLED && !env.DEMO_RESIDENT_PHONE) {
      ctx.addIssue({ code: 'custom', path: ['DEMO_RESIDENT_PHONE'], message: 'Set DEMO_RESIDENT_PHONE when DEMO_LOGIN_ENABLED is true' });
    }
    if (strict && !env.DATABASE_SSL_CA_PATH) {
      ctx.addIssue({ code: 'custom', path: ['DATABASE_SSL_CA_PATH'], message: 'A database CA certificate is required outside development/test' });
    }
    if (strict && env.CORS_ORIGINS.some((o) => o.startsWith('http://'))) {
      ctx.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: 'Only https origins are allowed outside development/test' });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
