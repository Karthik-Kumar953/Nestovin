import { randomUUID, createHash } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { sql } from 'kysely';
import type { z } from 'zod';
import type { Action, ModuleKey } from '@nestovin/contracts';
import { AppError, forbidden, unauthenticated, validationFailed } from '../lib/errors';
import { can } from '../auth/permissions';
import { withTx } from '../db/database';
import type { AppDeps } from './context';

/** Express 5 forwards rejected promises to the error handler; this keeps handler types tidy. */
export type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown;

export function requestId(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.header('x-request-id');
    req.requestId = incoming && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('x-request-id', req.requestId);
    next();
  };
}

function bearerToken(req: Request): string | undefined {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) return undefined;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : undefined;
}

/**
 * Authenticates an admin on every request:
 *  1. valid Supabase access token (signature, issuer, audience, expiry)
 *  2. TOTP MFA completed (aal2), unless explicitly disabled for local tests
 *  3. an admin profile exists (invite-only) and is not DISABLED
 * Grants and scope are loaded fresh from the DB (no cache).
 */
export function requireAdmin(deps: AppDeps): Handler {
  return async (req, _res, next) => {
    const token = bearerToken(req);
    if (!token) throw unauthenticated();

    let verified;
    try {
      verified = await deps.tokenVerifier.verify(token);
    } catch {
      throw unauthenticated('Your session is invalid or has expired. Sign in again.');
    }

    if (deps.env.ADMIN_REQUIRE_MFA && verified.aal !== 'aal2') {
      throw new AppError('MFA_REQUIRED', 'Complete two-factor verification to continue');
    }

    const loaded = await deps.adminLoader.load(verified.userId);
    // No profile = not an admin. Same response as a bad token: do not reveal account existence.
    if (!loaded) throw unauthenticated('Your session is invalid or has expired. Sign in again.');
    if (loaded.status === 'DISABLED') throw unauthenticated('This account has been disabled');

    if (loaded.status === 'INVITED') {
      // First authenticated request after accepting the invite (and passing MFA).
      await withTx(deps.db, { userId: loaded.actor.id, actorKind: 'admin', isSuperAdmin: false, clusterIds: [] }, (trx) =>
        trx
          .updateTable('app.admin_profiles')
          .set({ status: 'ACTIVE', last_sign_in_at: sql`now()` })
          .where('id', '=', loaded.actor.id)
          .where('status', '=', 'INVITED')
          .execute(),
      );
    }

    req.admin = loaded.actor;
    next();
  };
}

/** Module/action guard (layer 1). Must be mounted after requireAdmin. */
export function authorize(module: ModuleKey, action: Action): Handler {
  return (req, _res, next) => {
    if (!req.admin) throw unauthenticated();
    if (!can(req.admin, module, action)) throw forbidden();
    next();
  };
}

function toFieldErrors(error: z.ZodError) {
  return error.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message }));
}

/** Parse and replace req.body with the validated value. Unknown keys are stripped by Zod objects. */
export function validateBody<T extends z.ZodType>(schema: T): Handler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) throw validationFailed(toFieldErrors(result.error));
    req.body = result.data;
    next();
  };
}

export function parseQuery<T extends z.ZodType>(schema: T, req: Request): z.infer<T> {
  const result = schema.safeParse(req.query);
  if (!result.success) throw validationFailed(toFieldErrors(result.error));
  return result.data;
}

export function parseParam(schema: z.ZodType<string>, value: unknown, name = 'id'): string {
  const result = schema.safeParse(value);
  if (!result.success) throw validationFailed([{ path: name, message: 'Invalid identifier' }]);
  return result.data;
}

export function hashIp(ip: string | undefined, salt: string): string | null {
  if (!ip) return null;
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

/**
 * Fixed-window rate limit backed by Postgres (shared across API instances, no Redis).
 * `keyFn` decides what is limited (IP hash, user id, ...).
 */
export function rateLimit(
  deps: AppDeps,
  opts: { name: string; limit: number; windowSeconds: number; keyFn: (req: Request) => string | null },
): Handler {
  return async (req, res, next) => {
    const key = opts.keyFn(req);
    if (!key) return next();
    const { rows } = await sql<{ hits: number }>`
      select app.rate_limit_hit(${`${opts.name}:${key}`}, ${opts.windowSeconds}) as hits
    `.execute(deps.db);
    const hits = rows[0]?.hits ?? 0;
    res.setHeader('ratelimit-limit', String(opts.limit));
    res.setHeader('ratelimit-remaining', String(Math.max(0, opts.limit - hits)));
    if (hits > opts.limit) throw new AppError('RATE_LIMITED', 'Too many requests. Please try again later.');
    next();
  };
}
