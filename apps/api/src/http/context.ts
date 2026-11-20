import type { Env } from '../config/env';
import type { Database } from '../db/database';
import type { Logger } from '../lib/logger';
import type { TokenVerifier } from '../auth/token-verifier';
import type { AdminActorLoader } from '../auth/admin-actor-loader';
import type { AuthAdminAdapter } from '../integrations/auth-admin';
import type { AdminActor } from '../auth/permissions';

/** Everything route modules need, injected once at startup (and replaced with fakes in tests). */
export interface AppDeps {
  env: Env;
  db: Database;
  logger: Logger;
  tokenVerifier: TokenVerifier;
  adminLoader: AdminActorLoader;
  authAdmin: AuthAdminAdapter;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Correlates logs, audit rows and error responses. */
      requestId: string;
      /** Set by requireAdmin for authenticated admin requests. */
      admin?: AdminActor;
    }
  }
}

/** Use inside handlers mounted behind requireAdmin. */
export function adminOf(req: { admin?: AdminActor }): AdminActor {
  if (!req.admin) throw new Error('requireAdmin middleware is missing for this route');
  return req.admin;
}
