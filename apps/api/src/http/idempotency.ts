import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import type { AppDeps } from './context';
import type { Handler } from './middleware';
import { withTx } from '../db/database';
import { SYSTEM_CLAIMS } from '../modules/bookings/payments';
import { AppError, conflict, unauthenticated, validationFailed } from '../lib/errors';

const KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;

/**
 * Idempotency for POSTs that create money or bookings (ADR-004, review H-4).
 * The same key with the same body replays the first response; the same key
 * with a different body is rejected; a key still being processed answers 409.
 * Server errors (5xx) release the key so the client can retry. Keys are scoped
 * to the caller and kept for 24 hours.
 *
 * `required: false` honours a key when one is sent but does not demand it,
 * for clients that do not send keys yet.
 */
export function idempotent(deps: AppDeps, opts: { required: boolean }): Handler {
  return async (req, res, next) => {
    const key = req.header('idempotency-key');
    if (!key) {
      if (opts.required) throw validationFailed([{ path: 'Idempotency-Key', message: 'Send an Idempotency-Key header (8–100 letters, digits, - or _) with this request' }]);
      return next();
    }
    if (!KEY_RE.test(key)) throw validationFailed([{ path: 'Idempotency-Key', message: 'Use 8–100 letters, digits, - or _' }]);

    const actorKind = req.admin ? 'admin' : req.resident ? 'resident' : req.employee ? 'employee' : null;
    const actorId = req.admin?.id ?? req.resident?.id ?? req.employee?.id;
    if (!actorKind || !actorId) throw unauthenticated();
    const route = `${req.method} ${req.baseUrl}${req.path}`;
    const requestHash = createHash('sha256').update(JSON.stringify(req.body ?? null)).digest('hex');

    const claimed = await withTx(deps.db, SYSTEM_CLAIMS, (trx) =>
      trx
        .insertInto('app.idempotency_keys')
        .values({ actor_kind: actorKind, actor_id: actorId, key, route, request_hash: requestHash })
        .onConflict((oc) => oc.columns(['actor_kind', 'actor_id', 'key']).doNothing())
        .returning('key')
        .executeTakeFirst(),
    );

    if (!claimed) {
      const prior = await withTx(deps.db, SYSTEM_CLAIMS, (trx) =>
        trx
          .selectFrom('app.idempotency_keys')
          .select(['route', 'request_hash', 'status_code', 'response', 'expires_at'])
          .where('actor_kind', '=', actorKind)
          .where('actor_id', '=', actorId)
          .where('key', '=', key)
          .executeTakeFirst(),
      );
      if (!prior) throw conflict('This request is being processed. Try again in a moment.');
      if (prior.route !== route || prior.request_hash !== requestHash) {
        throw new AppError('VALIDATION_FAILED', 'This Idempotency-Key was already used for a different request. Use a new key.', [
          { path: 'Idempotency-Key', message: 'Already used for a different request' },
        ]);
      }
      if (prior.status_code === null) throw conflict('This request is still being processed. Try again in a moment.');
      res.setHeader('Idempotent-Replay', 'true');
      res.status(prior.status_code).json(prior.response);
      return;
    }

    // Capture the response so a retry with the same key gets it back.
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      const status = res.statusCode;
      const save =
        status >= 500
          ? withTx(deps.db, SYSTEM_CLAIMS, (trx) =>
              trx.deleteFrom('app.idempotency_keys').where('actor_kind', '=', actorKind).where('actor_id', '=', actorId).where('key', '=', key).execute(),
            )
          : withTx(deps.db, SYSTEM_CLAIMS, (trx) =>
              trx
                .updateTable('app.idempotency_keys')
                .set({ status_code: status, response: sql`${JSON.stringify(body ?? null)}::jsonb` })
                .where('actor_kind', '=', actorKind)
                .where('actor_id', '=', actorId)
                .where('key', '=', key)
                .execute(),
            );
      // Send only after the key is stored (or released), so an immediate retry sees the final state
      // instead of a spurious "still being processed".
      save
        .catch((err: unknown) => deps.logger.error({ err }, 'could not store idempotent response'))
        .finally(() => json(body));
      return res;
    };
    next();
  };
}
