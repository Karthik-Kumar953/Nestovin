import type { Env } from '../config/env';
import type { Database } from '../db/database';
import type { Logger } from '../lib/logger';
import type { TokenVerifier } from '../auth/token-verifier';
import type { AdminActorLoader } from '../auth/admin-actor-loader';
import type { AuthAdminAdapter } from '../integrations/auth-admin';
import type { StorageAdapter } from '../integrations/storage';
import type { PaymentProvider } from '../integrations/razorpay';
import type { SmsSender } from '../integrations/sms';
import type { Geocoder } from '../integrations/maps';
import type { ResidentActor } from '../modules/residents/auth';
import type { AdminActor } from '../auth/permissions';

/** Everything route modules need, injected once at startup (and replaced with fakes in tests). */
export interface AppDeps {
  env: Env;
  db: Database;
  logger: Logger;
  tokenVerifier: TokenVerifier;
  adminLoader: AdminActorLoader;
  authAdmin: AuthAdminAdapter;
  storage: StorageAdapter;
  /** null when Razorpay keys are not configured. */
  payments: PaymentProvider | null;
  /** null when MSG91 keys are not configured. */
  sms: SmsSender | null;
  /** null when GOOGLE_MAPS_API_KEY is not configured. */
  geocoder?: Geocoder | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Correlates logs, audit rows and error responses. */
      requestId: string;
      /** Set by requireAdmin for authenticated admin requests. */
      admin?: AdminActor;
      /** Set by requireResident for authenticated resident requests. */
      resident?: ResidentActor;
    }
  }
}

/** Use inside handlers mounted behind requireAdmin. */
export function adminOf(req: { admin?: AdminActor }): AdminActor {
  if (!req.admin) throw new Error('requireAdmin middleware is missing for this route');
  return req.admin;
}

/** Use inside handlers mounted behind requireResident. */
export function residentOf(req: { resident?: ResidentActor }): ResidentActor {
  if (!req.resident) throw new Error('requireResident middleware is missing for this route');
  return req.resident;
}
