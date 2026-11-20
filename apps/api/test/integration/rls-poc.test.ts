import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { adminPool, appPool, databaseAvailable } from '../helpers/db';

/*
 * ADR-001 proof of concept: can the restricted `app_api` role, connecting
 * through the Supabase pooler, rely on transaction-local claims + RLS?
 * Uses a throwaway schema so it does not depend on Phase 3 tables.
 */

const available = await databaseAvailable();
const C1 = randomUUID();
const C2 = randomUUID();
const RESIDENT_A = randomUUID();
const RESIDENT_B = randomUUID();

async function inTx<T>(pool: pg.Pool, claims: Record<string, string> | null, fn: (c: pg.PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    if (claims) {
      for (const [k, v] of Object.entries(claims)) {
        await client.query('select set_config($1, $2, true)', [`app.${k}`, v]);
      }
    }
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

describe.skipIf(!available)('RLS proof of concept (ADR-001)', () => {
  let admin: pg.Pool;
  let app: pg.Pool;

  beforeAll(async () => {
    admin = adminPool();
    app = appPool(1); // one connection: proves claims never leak between transactions
    await admin.query(`
      drop schema if exists poc_rls cascade;
      create schema poc_rls;
      grant usage on schema poc_rls to app_api;

      create table poc_rls.resident_profiles (id uuid primary key, user_id uuid not null, cluster_id uuid not null);
      alter table poc_rls.resident_profiles enable row level security;
      create policy owner_or_cluster_admin on poc_rls.resident_profiles
        using (
          user_id = app.claim_user_id()
          or (app.claim_actor_kind() = 'admin' and app.claim_has_cluster(cluster_id))
        );

      create table poc_rls.support_tickets (id uuid primary key default gen_random_uuid(), cluster_id uuid not null, subject text);
      alter table poc_rls.support_tickets enable row level security;
      create policy cluster_scope on poc_rls.support_tickets
        using (app.claim_actor_kind() = 'admin' and app.claim_has_cluster(cluster_id))
        with check (app.claim_actor_kind() = 'admin' and app.claim_has_cluster(cluster_id));

      grant select on poc_rls.resident_profiles to app_api;
      grant select, insert on poc_rls.support_tickets to app_api;
    `);
    await admin.query(
      `insert into poc_rls.resident_profiles values ($1, $2, $3), ($4, $5, $6)`,
      [randomUUID(), RESIDENT_A, C1, randomUUID(), RESIDENT_B, C2],
    );
    await admin.query(`insert into poc_rls.support_tickets (cluster_id, subject) values ($1, 'c1'), ($2, 'c2')`, [C1, C2]);
  });

  afterAll(async () => {
    await admin?.query('drop schema if exists poc_rls cascade');
    await app?.end();
    await admin?.end();
  });

  it('connects as the restricted role (not a superuser, cannot bypass RLS)', async () => {
    const { rows } = await app.query(
      `select current_user as u, r.rolsuper as super, r.rolbypassrls as bypass
         from pg_roles r where r.rolname = current_user`,
    );
    expect(rows[0]).toMatchObject({ u: 'app_api', super: false, bypass: false });
  });

  it('denies everything when no claims are set', async () => {
    const rows = await inTx(app, null, (c) => c.query('select * from poc_rls.resident_profiles'));
    expect(rows.rowCount).toBe(0);
  });

  it('lets a resident see only their own profile', async () => {
    const res = await inTx(app, { user_id: RESIDENT_A, actor_kind: 'resident' }, (c) =>
      c.query('select user_id from poc_rls.resident_profiles'),
    );
    expect(res.rows).toEqual([{ user_id: RESIDENT_A }]);
  });

  it('lets a cluster-scoped admin see only their cluster', async () => {
    const res = await inTx(app, { user_id: randomUUID(), actor_kind: 'admin', cluster_ids: C1 }, (c) =>
      c.query('select subject from poc_rls.support_tickets'),
    );
    expect(res.rows).toEqual([{ subject: 'c1' }]);
  });

  it('blocks writes into another cluster (WITH CHECK)', async () => {
    await expect(
      inTx(app, { user_id: randomUUID(), actor_kind: 'admin', cluster_ids: C1 }, (c) =>
        c.query(`insert into poc_rls.support_tickets (cluster_id, subject) values ($1, 'sneaky')`, [C2]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('gives global-scope admins all clusters', async () => {
    const res = await inTx(app, { user_id: randomUUID(), actor_kind: 'admin', cluster_ids: '*' }, (c) =>
      c.query('select count(*)::int as n from poc_rls.support_tickets'),
    );
    expect(res.rows[0].n).toBeGreaterThanOrEqual(2);
  });

  it('never leaks claims to the next transaction on the same pooled connection', async () => {
    await inTx(app, { user_id: RESIDENT_A, actor_kind: 'resident' }, async () => undefined);
    const res = await inTx(app, null, (c) =>
      c.query(`select coalesce(current_setting('app.user_id', true), '') as uid,
                      (select count(*)::int from poc_rls.resident_profiles) as visible`),
    );
    expect(res.rows[0]).toEqual({ uid: '', visible: 0 });
  });

  it('keeps Supabase client roles out of the app schema entirely', async () => {
    for (const role of ['anon', 'authenticated']) {
      const client = await admin.connect();
      try {
        await client.query('begin');
        await client.query(`set local role ${role}`);
        await expect(client.query('select * from app.cities limit 1')).rejects.toThrow(/permission denied/);
      } finally {
        await client.query('rollback').catch(() => undefined);
        client.release();
      }
    }
  });

  it('measures claim-setup overhead (informational)', { timeout: 120_000 }, async () => {
    // Small sample: each transaction is a network round trip to the hosted project.
    const n = 20;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) await inTx(app, null, (c) => c.query('select 1'));
    const plain = performance.now() - t0;
    const t1 = performance.now();
    for (let i = 0; i < n; i++) {
      await inTx(app, { user_id: RESIDENT_A, actor_kind: 'admin', is_super_admin: 'false', cluster_ids: C1 }, (c) =>
        c.query('select 1'),
      );
    }
    const withClaims = performance.now() - t1;
    console.warn(`[rls-poc] per transaction: without claims ${(plain / n).toFixed(1)}ms, with claims ${(withClaims / n).toFixed(1)}ms`);
    expect(withClaims).toBeLessThan(plain * 10 + 2000);
  });
});
