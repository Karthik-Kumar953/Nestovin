import { sql } from 'kysely';
import type { AppDeps } from '../../http/context';
import type { Handler } from '../../http/middleware';
import { withTx, type DbClaims } from '../../db/database';
import { forbidden, unauthenticated } from '../../lib/errors';

/** The authenticated resident for the current request (loaded on every request). */
export interface ResidentActor {
  id: string;
  phone: string;
}

export function residentClaims(actor: { id: string }): DbClaims {
  return { userId: actor.id, actorKind: 'resident', isSuperAdmin: false, clusterIds: [] };
}

/**
 * Resident authentication (RES-01, ADR-012):
 *  - valid Supabase access token from PHONE OTP (tokens without a phone, such as
 *    admin email accounts, are rejected here)
 *  - first request creates the resident profile from the verified phone
 *  - approved family requests for this phone are attached to the household
 *  - suspended residents are refused
 */
export function requireResident(deps: AppDeps): Handler {
  return async (req, _res, next) => {
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw unauthenticated();

    let verified;
    try {
      verified = await deps.tokenVerifier.verify(token);
    } catch {
      throw unauthenticated('Your session is invalid or has expired. Sign in again.');
    }
    if (!verified.phone) throw unauthenticated('Sign in with your phone number to use the resident app');
    const phone = verified.phone;

    const status = await withTx(deps.db, residentClaims({ id: verified.userId }), async (trx) => {
      let profile = await trx
        .selectFrom('app.resident_profiles')
        .select(['id', 'status'])
        .where('id', '=', verified.userId)
        .executeTakeFirst();
      if (!profile) {
        profile = await trx
          .insertInto('app.resident_profiles')
          .values({ id: verified.userId, phone })
          .onConflict((oc) => oc.column('id').doNothing())
          .returning(['id', 'status'])
          .executeTakeFirst();
        profile ??= await trx
          .selectFrom('app.resident_profiles')
          .select(['id', 'status'])
          .where('id', '=', verified.userId)
          .executeTakeFirstOrThrow();
      }
      if (profile.status !== 'ACTIVE') return profile.status;

      const active = await trx
        .selectFrom('app.residence_memberships')
        .select('id')
        .where('resident_id', '=', verified.userId)
        .where('status', 'in', ['PENDING', 'VERIFIED'])
        .executeTakeFirst();
      if (!active) {
        // Family member whose request was approved: join the household now.
        await sql`select app.attach_approved_family(${phone})`.execute(trx);
      }
      return profile.status;
    });

    if (status === 'SUSPENDED') throw forbidden('This account is suspended. Contact Nestovin support.');
    req.resident = { id: verified.userId, phone };
    next();
  };
}
