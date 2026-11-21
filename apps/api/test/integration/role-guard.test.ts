import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { createDatabase, withTx } from '../../src/db/database';
import { assertRestrictedRole } from '../../src/db/role-guard';
import { fromPgError } from '../../src/lib/errors';
import { ADMIN_URL, appDatabase, databaseAvailable } from '../helpers/db';

/* Review M-10 and M-15. */
const available = await databaseAvailable();

describe.skipIf(!available)('database role safety', { timeout: 60_000 }, () => {
  const app = appDatabase();
  const privileged = createDatabase(ADMIN_URL!, process.env.DATABASE_SSL_CA_PATH);
  afterAll(async () => {
    await app.destroy();
    await privileged.destroy();
  });

  it('the API role passes; a role that bypasses RLS is refused', async () => {
    await expect(assertRestrictedRole(app)).resolves.toBeTypeOf('string');
    const { rows } = await sql<{ bypass: boolean; superuser: boolean }>`select rolbypassrls as bypass, rolsuper as superuser from pg_roles where rolname = current_user`.execute(privileged);
    if (rows[0]!.bypass || rows[0]!.superuser) await expect(assertRestrictedRole(privileged)).rejects.toThrow(/bypasses row-level security/);
  });

  it('every request transaction has statement, lock and idle-in-transaction timeouts; jobs get more room', async () => {
    const show = (claims: Parameters<typeof withTx>[1]) =>
      withTx(app, claims, async (trx) =>
        (
          await sql<{ s: string; l: string; i: string }>`select current_setting('statement_timeout') as s, current_setting('lock_timeout') as l, current_setting('idle_in_transaction_session_timeout') as i`.execute(trx)
        ).rows[0],
      );
    expect(await show({ userId: null, actorKind: 'public', isSuperAdmin: false, clusterIds: [] })).toEqual({ s: '15s', l: '5s', i: '30s' });
    expect(await show({ userId: null, actorKind: 'system', isSuperAdmin: false, clusterIds: 'all' })).toEqual({ s: '2min', l: '10s', i: '1min' });
  });

  it('lock and statement timeouts become a retryable 503', () => {
    expect(fromPgError({ code: '55P03' })?.status).toBe(503);
    expect(fromPgError({ code: '57014' })?.code).toBe('UNAVAILABLE');
  });
});
