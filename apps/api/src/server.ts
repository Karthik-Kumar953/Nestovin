import { loadEnv } from './config/env';
import { createLogger } from './lib/logger';
import { createDatabase } from './db/database';
import { createSupabaseTokenVerifier } from './auth/token-verifier';
import { createAdminActorLoader } from './auth/admin-actor-loader';
import { createSupabaseAuthAdmin } from './integrations/auth-admin';
import { createSupabaseStorage } from './integrations/storage';
import { createApp } from './app';
import { createRazorpay } from './integrations/razorpay';
import { PaymentService } from './modules/bookings/payments';
import { startJobs } from './jobs/runner';
import { AllocationService } from './modules/workforce/allocation';
import { NotificationService } from './modules/notifications/service';
import { createFcm, createResend } from './integrations/messaging';
import { createMsg91 } from './integrations/sms';
import { createGoogleGeocoder } from './integrations/maps';

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');
const db = createDatabase(env.DATABASE_URL, env.DATABASE_SSL_CA_PATH);

const paymentsProvider =
  env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET
    ? createRazorpay({ keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET })
    : null;
if (!paymentsProvider) logger.warn('Razorpay keys are not set: online payments are disabled');
// One line per integration so it is obvious what is live after adding keys.
logger.info(
  {
    razorpay: Boolean(paymentsProvider),
    razorpayWebhooks: Boolean(env.RAZORPAY_WEBHOOK_SECRET),
    smsOtp: Boolean(env.MSG91_AUTH_KEY && env.MSG91_OTP_TEMPLATE_ID && env.SUPABASE_SMS_HOOK_SECRET),
    push: Boolean(env.FCM_PROJECT_ID && env.FCM_CLIENT_EMAIL && env.FCM_PRIVATE_KEY),
    email: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM),
    maps: Boolean(env.GOOGLE_MAPS_API_KEY),
  },
  'integrations',
);
const payments = new PaymentService(db, paymentsProvider, logger);

const app = createApp({
  env,
  db,
  logger,
  tokenVerifier: createSupabaseTokenVerifier({ supabaseUrl: env.SUPABASE_URL, jwtSecret: env.SUPABASE_JWT_SECRET }),
  adminLoader: createAdminActorLoader(db),
  authAdmin: createSupabaseAuthAdmin({ supabaseUrl: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }),
  storage: createSupabaseStorage({ supabaseUrl: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }),
  payments: paymentsProvider,
  geocoder: env.GOOGLE_MAPS_API_KEY ? createGoogleGeocoder(env.GOOGLE_MAPS_API_KEY) : null,
  sms: env.MSG91_AUTH_KEY && env.MSG91_OTP_TEMPLATE_ID ? createMsg91({ authKey: env.MSG91_AUTH_KEY, templateId: env.MSG91_OTP_TEMPLATE_ID, otpVariable: env.MSG91_OTP_VARIABLE }) : null,
}, payments);
const stopJobs = env.JOBS_ENABLED && env.NODE_ENV !== 'test' ? startJobs({
        db,
        logger,
        payments,
        allocation: new AllocationService(db, logger),
        notifications: new NotificationService(
          db,
          env.FCM_PROJECT_ID && env.FCM_CLIENT_EMAIL && env.FCM_PRIVATE_KEY ? createFcm({ projectId: env.FCM_PROJECT_ID, clientEmail: env.FCM_CLIENT_EMAIL, privateKey: env.FCM_PRIVATE_KEY }) : null,
          env.RESEND_API_KEY && env.EMAIL_FROM ? createResend({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM }) : null,
          logger,
        ),
      }) : () => undefined;

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Nestovin API listening');
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  stopJobs();
  server.close();
  await db.destroy();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
