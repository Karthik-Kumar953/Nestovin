import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import request from 'supertest';
import { allCatalogueGrants, grantKey, isGrantable, type GrantKey } from '@nestovin/contracts';
import { createApp } from '../../src/app';
import type { Database } from '../../src/db/database';
import { BookingAdminService } from '../../src/modules/bookings/admin-service';
import type { ResidentActor } from '../../src/modules/residents/auth';
import { actor, fakeDeps } from '../helpers/fake-deps';
import { adminPool, appDatabase, appPool, databaseAvailable } from '../helpers/db';
import { Fixtures, commercialFixture } from '../helpers/qa-fixtures';

/*
 * Data-scope half of the authZ matrix (the unit half is route-authz-matrix):
 *  - an admin scoped to the record's cluster gets 200
 *  - an admin with the same grants scoped to another cluster gets 404 (never 403:
 *    out-of-scope records must look like they do not exist)
 * plus a generic RLS sweep: for every RLS-enabled table with a cluster or
 * resident column, out-of-scope claims see none of the fixture rows.
 */

const available = await databaseAvailable();
const grantable: GrantKey[] = allCatalogueGrants().filter((g) => isGrantable(g.module)).map((g) => grantKey(g.module, g.action));

describe.skipIf(!available)('route data scope and RLS', { timeout: 120_000 }, () => {
  let db: Database;
  let admin: pg.Pool;
  let appRole: pg.Pool;
  let fx: Fixtures;
  let f: Awaited<ReturnType<typeof commercialFixture>>;
  let http: ReturnType<typeof createApp>;
  let cycleId: string;
  let A: ResidentActor;
  let B: ResidentActor;
  const root = actor({ id: randomUUID(), isSuperAdmin: true });
  const ids = { north: randomUUID(), south: randomUUID(), global: randomUUID() };

  beforeAll(async () => {
    db = appDatabase();
    admin = adminPool();
    appRole = appPool(2);
    fx = new Fixtures(admin);
    f = await commercialFixture(fx, db, actor({ id: randomUUID(), scope: { type: 'GLOBAL' } }), 2);
    A = await fx.resident({ flatId: f.flats[0]! });
    B = await fx.resident({ flatId: f.flats[1]! });
    const ops = new BookingAdminService(db);
    const c = await ops.createCycle(root, 'qa', f.communityId, {
      name: `QA scope ${fx.s}`,
      opensAt: new Date(Date.now() - 60_000).toISOString(),
      closesAt: new Date(Date.now() + 86_400_000).toISOString(),
      initialPct: 30,
      planIds: [f.planId],
    });
    cycleId = c.id;

    const deps = fakeDeps({
      [ids.north]: { status: 'ACTIVE', actor: actor({ id: ids.north, grants: grantable, scope: { type: 'CLUSTERS', clusterIds: [f.north] } }) },
      [ids.south]: { status: 'ACTIVE', actor: actor({ id: ids.south, grants: grantable, scope: { type: 'CLUSTERS', clusterIds: [f.south] } }) },
      [ids.global]: { status: 'ACTIVE', actor: actor({ id: ids.global, grants: grantable, scope: { type: 'GLOBAL' } }) },
    });
    http = createApp({ ...deps, db });
  });

  afterAll(async () => {
    await fx?.cleanup();
    await db?.destroy();
    await admin?.end();
    await appRole?.end();
  });

  const get = (path: string, who: keyof typeof ids) => request(http).get(`/v1/admin${path}`).set('Authorization', `Bearer token:aal2:${ids[who]}`);

  const byId = () => [
    ['locations', `/communities/${f.communityId}`],
    ['locations', `/communities/${f.communityId}/towers`],
    ['catalogue', `/communities/${f.communityId}/services`],
    ['catalogue', `/communities/${f.communityId}/residence-categories`],
    ['catalogue', `/communities/${f.communityId}/time-windows`],
    ['catalogue', `/communities/${f.communityId}/catalogue-versions`],
    ['catalogue', `/catalogue-versions/${f.version}`],
    ['migration', `/communities/${f.communityId}/import-batches`],
    ['scheduling', `/communities/${f.communityId}/slots`],
    ['demand', `/communities/${f.communityId}/demand-cycles`],
    ['demand', `/demand-cycles/${cycleId}`],
    ['demand', `/demand-cycles/${cycleId}/summary`],
    ['demand', `/demand-cycles/${cycleId}/requests`],
    ['residents', `/residents/${A.id}`],
  ];

  it('200 for an admin scoped to the record’s cluster, 404 for another cluster', async () => {
    const results: string[] = [];
    for (const [area, path] of byId()) {
      const inScope = await get(path!, 'north');
      const outScope = await get(path!, 'south');
      const global = await get(path!, 'global');
      results.push(`${area} ${path!.replace(/[0-9a-f-]{36}/g, ':id')} in=${inScope.status} out=${outScope.status} global=${global.status}`);
    }
    const bad = results.filter((r) => !/in=200 out=404 global=200$/.test(r));
    expect(bad).toEqual([]);
  });

  it('lists only contain in-scope records', async () => {
    const names = async (who: keyof typeof ids) => ((await get(`/communities?limit=100&q=${fx.s}`, who)).body.items as { name: string }[]).map((c) => c.name).sort();
    expect(await names('north')).toEqual([`QA Alpha ${fx.s}`]);
    expect(await names('south')).toEqual([`QA Beta ${fx.s}`]);
    expect(await names('global')).toEqual([`QA Alpha ${fx.s}`, `QA Beta ${fx.s}`]);
    const residents = async (who: keyof typeof ids) => ((await get(`/residents?limit=100&q=QA ${fx.s}`, who)).body.items as { id: string }[]).map((r) => r.id);
    expect(await residents('north')).toEqual(expect.arrayContaining([A.id, B.id]));
    expect(await residents('south')).not.toEqual(expect.arrayContaining([A.id]));
  });

  it('an out-of-scope write is 404 and changes nothing', async () => {
    const before = (await admin.query(`select name from app.communities where id = $1`, [f.communityId])).rows[0].name;
    const res = await request(http)
      .patch(`/v1/admin/communities/${f.communityId}`)
      .set('Authorization', `Bearer token:aal2:${ids.south}`)
      .send({ name: 'QA hijacked', version: 1 });
    expect(res.status).toBe(404);
    expect((await admin.query(`select name from app.communities where id = $1`, [f.communityId])).rows[0].name).toBe(before);
  });

  async function asClaims<T>(claims: Record<string, string>, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const c = await appRole.connect();
    try {
      await c.query('begin');
      for (const [k, v] of Object.entries(claims)) await c.query('select set_config($1, $2, true)', [`app.${k}`, v]);
      return await fn(c);
    } finally {
      await c.query('rollback').catch(() => undefined);
      c.release();
    }
  }

  async function rlsTablesWith(column: string): Promise<string[]> {
    const { rows } = await admin.query<{ t: string }>(
      `select c.relname t from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'app' and c.relkind = 'r' and c.relrowsecurity
          and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = $1 and not a.attisdropped)
          and has_table_privilege('app_api', c.oid, 'select')
        order by 1`,
      [column],
    );
    return rows.map((r) => r.t);
  }

  it('RLS cross-cluster: an admin scoped to south sees no north rows in any cluster-scoped table', async () => {
    const tables = await rlsTablesWith('cluster_id');
    expect(tables.length).toBeGreaterThan(5);
    const leaks: string[] = [];
    await asClaims({ user_id: ids.south, actor_kind: 'admin', is_super_admin: 'false', cluster_ids: f.south }, async (c) => {
      for (const t of tables) {
        const n = (await c.query(`select count(*)::int n from app.${t} where cluster_id = $1`, [f.north])).rows[0].n as number;
        if (n > 0) leaks.push(`${t}: ${n}`);
      }
    });
    expect(leaks).toEqual([]);
    // Sanity: the same claims scoped to north do see the north community's rows.
    const seen = await asClaims({ user_id: ids.north, actor_kind: 'admin', is_super_admin: 'false', cluster_ids: f.north }, (c) =>
      c.query(`select count(*)::int n from app.communities where id = $1`, [f.communityId]),
    );
    expect(seen.rows[0].n).toBe(1);
  });

  it('RLS cross-household: resident B sees none of resident A’s rows in any resident-scoped table', async () => {
    const tables = await rlsTablesWith('resident_id');
    expect(tables.length).toBeGreaterThan(3);
    const leaks: string[] = [];
    await asClaims({ user_id: B.id, actor_kind: 'resident', is_super_admin: 'false', cluster_ids: '' }, async (c) => {
      for (const t of tables) {
        const n = (await c.query(`select count(*)::int n from app.${t} where resident_id = $1`, [A.id])).rows[0].n as number;
        if (n > 0) leaks.push(`${t}: ${n}`);
      }
      const profiles = (await c.query(`select count(*)::int n from app.resident_profiles where id = $1`, [A.id])).rows[0].n as number;
      if (profiles > 0) leaks.push(`resident_profiles: ${profiles}`);
    });
    expect(leaks).toEqual([]);
    // Sanity: A sees their own membership.
    const own = await asClaims({ user_id: A.id, actor_kind: 'resident', is_super_admin: 'false', cluster_ids: '' }, (c) =>
      c.query(`select count(*)::int n from app.residence_memberships where resident_id = $1`, [A.id]),
    );
    expect(own.rows[0].n).toBe(1);
  });

  it('RLS: a resident cannot write into another household', async () => {
    await asClaims({ user_id: B.id, actor_kind: 'resident', is_super_admin: 'false', cluster_ids: '' }, async (c) => {
      const upd = await c.query(`update app.resident_profiles set full_name = 'QA hijack' where id = $1`, [A.id]).catch((e: Error) => e);
      if (!(upd instanceof Error)) expect(upd.rowCount).toBe(0);
    });
    expect((await admin.query(`select full_name from app.resident_profiles where id = $1`, [A.id])).rows[0].full_name).not.toBe('QA hijack');
  });
});
