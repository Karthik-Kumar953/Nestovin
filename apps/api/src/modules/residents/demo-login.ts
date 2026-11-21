import type { Request } from 'express';
import type { DemoLoginResponse } from '@nestovin/contracts';
import type { AppDeps } from '../../http/context';
import { hashIp } from '../../http/middleware';
import { withTx } from '../../db/database';
import { conflict } from '../../lib/errors';
import { auditSystem } from '../audit/audit';
import { SYSTEM_CLAIMS } from '../bookings/payments';

/** Internal, non-deliverable email alias the demo resident signs in with (.invalid is reserved, RFC 2606). */
export const DEMO_RESIDENT_EMAIL = 'demo-resident@nestovin.invalid';

const RUN_SEED = 'Run the dev demo seed (corepack pnpm --filter @nestovin/api seed:dev-demo) with DEMO_RESIDENT_PHONE set, then try again.';

/**
 * DEV-ONLY Resident app demo login (DEMO_LOGIN_ENABLED, never in production; see config/env.ts).
 * Supabase has no SMS provider in development, so the seeded demo resident (DEMO_RESIDENT_PHONE)
 * gets a magic-link token hash instead. The app exchanges it with
 * supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }) for a normal Supabase session of
 * that same resident, so every resident route works unchanged. Only the hash is returned.
 */
export function demoLoginEnabled(deps: AppDeps): boolean {
  return deps.env.DEMO_LOGIN_ENABLED && deps.env.NODE_ENV !== 'production' && Boolean(deps.env.DEMO_RESIDENT_PHONE);
}

/** Issues the demo resident's magic-link token hash; 409 with a "run the seed" hint when it is missing. */
export async function demoLogin(deps: AppDeps, req: Request): Promise<DemoLoginResponse> {
  const phone = deps.env.DEMO_RESIDENT_PHONE!;
  const resident = await withTx(deps.db, SYSTEM_CLAIMS, (trx) =>
    trx.selectFrom('app.resident_profiles').select(['id', 'status']).where('phone', '=', phone).executeTakeFirst(),
  );
  if (!resident) throw conflict(`The demo resident (${phone}) does not exist. ${RUN_SEED}`);
  if (resident.status !== 'ACTIVE') throw conflict('The demo resident account is not active.');
  if (!deps.authAdmin.demoSignInTokenHash) throw conflict('Demo login is not available with this auth adapter.');
  const issued = await deps.authAdmin.demoSignInTokenHash(resident.id, DEMO_RESIDENT_EMAIL);
  if (issued === 'NO_USER') throw conflict(`The demo resident has no Supabase auth user. ${RUN_SEED}`);
  await withTx(deps.db, SYSTEM_CLAIMS, (trx) =>
    auditSystem(trx, 'public', req.requestId, {
      action: 'auth.demo_login',
      targetType: 'resident',
      targetId: resident.id,
      reason: 'Dev-only demo login (DEMO_LOGIN_ENABLED)',
      after: { ipHash: hashIp(req.ip, deps.env.IP_HASH_SALT) },
    }),
  );
  return { tokenHash: issued.tokenHash, type: 'magiclink' };
}
