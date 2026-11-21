import { readFileSync } from 'node:fs';
import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import pg from 'pg';
import type { DB } from './schema';

export type Database = Kysely<DB>;
export type Tx = Transaction<DB>;

// Return bigint/int8 as string (audit ids) and keep timestamps as Date.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => v);
// Calendar dates stay 'YYYY-MM-DD' strings (no timezone shifting).
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

/**
 * TLS for non-local databases. With a CA file the server certificate is fully
 * verified. Without one (development against a hosted dev project only) the
 * connection is still encrypted but not verified; env validation forbids that
 * in staging/production.
 */
export function sslOptions(connectionString: string, caPath?: string): pg.PoolConfig['ssl'] {
  const host = new URL(connectionString).hostname;
  if (['127.0.0.1', 'localhost', '::1'].includes(host)) return undefined;
  if (caPath) return { ca: readFileSync(caPath, 'utf8'), rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

export function createDatabase(connectionString: string, caPath?: string): Database {
  const pool = new pg.Pool({
    connectionString,
    ssl: sslOptions(connectionString, caPath),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Prepared statements are not compatible with transaction-mode pooling.
    // node-postgres only prepares when a statement name is given, which Kysely never does.
  });
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
}

/**
 * Claims attached to every transaction (ADR-001). Read by RLS policies on
 * Tier A tables and by stamping/audit triggers. Values are transaction-local
 * (set_config(..., is_local = true)) so they can never leak to another request
 * that later reuses the same pooled connection.
 */
export interface DbClaims {
  userId: string | null;
  actorKind: 'admin' | 'resident' | 'employee' | 'system' | 'public';
  isSuperAdmin: boolean;
  /** 'all' for global scope; otherwise the cluster ids the actor may access. */
  clusterIds: 'all' | readonly string[];
}

/**
 * Per-transaction time limits (review M-15). Role-level defaults only reach new server connections,
 * and the transaction pooler reuses old ones, so the limits are set here, transaction-locally, on
 * every transaction. Background jobs (system claims) get more room than requests.
 */
const LIMITS = {
  request: { statement: '15s', lock: '5s', idle: '30s' },
  job: { statement: '120s', lock: '10s', idle: '60s' },
} as const;

export async function applyClaims(trx: Tx, claims: DbClaims): Promise<void> {
  const clusters = claims.clusterIds === 'all' ? '*' : claims.clusterIds.join(',');
  const l = claims.actorKind === 'system' ? LIMITS.job : LIMITS.request;
  await sql`
    select
      set_config('app.user_id', ${claims.userId ?? ''}, true),
      set_config('app.actor_kind', ${claims.actorKind}, true),
      set_config('app.is_super_admin', ${String(claims.isSuperAdmin)}, true),
      set_config('app.cluster_ids', ${clusters}, true),
      set_config('statement_timeout', ${l.statement}, true),
      set_config('lock_timeout', ${l.lock}, true),
      set_config('idle_in_transaction_session_timeout', ${l.idle}, true)
  `.execute(trx);
}

/** Run `fn` in one transaction with the caller's claims applied first. */
export function withTx<T>(db: Database, claims: DbClaims, fn: (trx: Tx) => Promise<T>): Promise<T> {
  return db.transaction().execute(async (trx) => {
    await applyClaims(trx, claims);
    return fn(trx);
  });
}
