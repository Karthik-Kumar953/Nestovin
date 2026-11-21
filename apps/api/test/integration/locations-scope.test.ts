import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../src/lib/errors';
import { LocationService } from '../../src/modules/locations/service';
import type { Database } from '../../src/db/database';
import { actor } from '../helpers/fake-deps';
import { appDatabase, databaseAvailable, uniq } from '../helpers/db';
import { cleanupSuite } from '../helpers/qa-fixtures';

const available = await databaseAvailable();

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

describe.skipIf(!available)('location master data: scope and integrity', () => {
  let db: Database;
  let svc: LocationService;
  const s = uniq();
  const root = actor({ id: randomUUID(), scope: { type: 'GLOBAL' }, grants: [] });
  let c1: string;
  let c2: string;
  let cityId: string;
  let comm1: string;
  let comm2: string;

  beforeAll(async () => {
    db = appDatabase();
    svc = new LocationService(db);
    cityId = (await svc.createCity(root, 'test', { name: `Test City ${s}`, state: 'Telangana' })).id;
    c1 = (await svc.createCluster(root, 'test', { name: `North ${s}`, code: `N${s}` })).id;
    c2 = (await svc.createCluster(root, 'test', { name: `South ${s}`, code: `S${s}` })).id;
    comm1 = (await svc.createCommunity(root, 'test', { cityId, name: `Alpha ${s}`, code: `A${s}`, clusterId: c1 })).id;
    comm2 = (await svc.createCommunity(root, 'test', { cityId, name: `Beta ${s}`, code: `B${s}`, clusterId: c2 })).id;
  });
  afterAll(async () => {
    await db?.destroy();
    // Last, so it never delays the suite's own resets (hook timeouts on a busy shared DB).
    // Removes this suite's fixtures from the shared dev database (test/helpers/qa-fixtures.ts).
    await cleanupSuite({ suffix: s });
  }, 180_000);

  const north = () => actor({ id: randomUUID(), scope: { type: 'CLUSTERS', clusterIds: [c1] } });

  it('a cluster-scoped admin lists only communities in their cluster', async () => {
    const page = await svc.listCommunities(north(), { limit: 100, cityId });
    expect(page.items.map((c) => c.id)).toEqual([comm1]);
  });

  it('direct lookup of another cluster’s community answers NOT_FOUND', async () => {
    await expectCode(svc.getCommunity(north(), comm2), 'NOT_FOUND');
    await expectCode(svc.listTowers(north(), comm2, { limit: 10 }), 'NOT_FOUND');
  });

  it('cluster-scoped admins cannot create cities or clusters', async () => {
    await expectCode(svc.createCity(north(), 't', { name: `X ${s}`, state: 'TS' }), 'FORBIDDEN');
    await expectCode(svc.createCluster(north(), 't', { name: `X ${s}`, code: `X${s}` }), 'FORBIDDEN');
  });

  it('a new community from a cluster-scoped admin must go into one of their clusters', async () => {
    await expectCode(svc.createCommunity(north(), 't', { cityId, name: `G ${s}`, code: `G${s}` }), 'BUSINESS_RULE_VIOLATION');
    await expectCode(
      svc.createCommunity(north(), 't', { cityId, name: `G ${s}`, code: `G${s}`, clusterId: c2 }),
      'NOT_FOUND',
    );
  });

  it('unassigned communities are visible to global scope only', async () => {
    const lone = await svc.createCommunity(root, 't', { cityId, name: `Lone ${s}`, code: `L${s}` });
    await expectCode(svc.getCommunity(north(), lone.id), 'NOT_FOUND');
    expect((await svc.getCommunity(root, lone.id)).clusterId).toBeNull();
  });

  it('moving a community keeps the membership history and needs scope over the target', async () => {
    await expectCode(svc.assignCluster(north(), 't', comm1, { clusterId: c2, reason: 'rebalance' }), 'NOT_FOUND');
    const moved = await svc.assignCluster(root, 't', comm1, { clusterId: c2, reason: 'Workforce rebalance' });
    expect(moved.clusterId).toBe(c2);
    const history = await svc.membershipHistory(root, comm1);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ clusterId: c2, effectiveTo: null });
    expect(history[1]).toMatchObject({ clusterId: c1 });
    expect(history[1]!.effectiveTo).not.toBeNull();
    // After the move, the north admin no longer sees it.
    await expectCode(svc.getCommunity(north(), comm1), 'NOT_FOUND');
    await svc.assignCluster(root, 't', comm1, { clusterId: c1, reason: 'Move back' });
  });

  it('enforces uniqueness with field-level errors', async () => {
    const tower = await svc.createTower(root, 't', { communityId: comm1, name: 'Tower A' });
    await expectCode(svc.createTower(root, 't', { communityId: comm1, name: 'tower a' }), 'CONFLICT');
    await svc.createFlat(root, 't', { towerId: tower.id, flatNumber: '101', floor: 1, bhkType: '2 BHK' });
    await expect(svc.createFlat(root, 't', { towerId: tower.id, flatNumber: '101' })).rejects.toMatchObject({
      code: 'CONFLICT',
      fields: [{ path: 'flatNumber' }],
    });
  });

  it('blocks children under inactive parents and deactivation of parents with active children', async () => {
    const tower = await svc.createTower(root, 't', { communityId: comm1, name: `Tower Z ${s}` });
    await svc.createFlat(root, 't', { towerId: tower.id, flatNumber: '1' });
    await expectCode(svc.updateTower(root, 't', tower.id, { status: 'INACTIVE', version: tower.version }), 'BUSINESS_RULE_VIOLATION');

    const empty = await svc.createTower(root, 't', { communityId: comm1, name: `Tower Y ${s}` });
    const inactive = await svc.updateTower(root, 't', empty.id, { status: 'INACTIVE', version: empty.version });
    await expectCode(svc.createFlat(root, 't', { towerId: inactive.id, flatNumber: '1' }), 'BUSINESS_RULE_VIOLATION');
  });

  it('rejects stale edits (optimistic concurrency)', async () => {
    const city = await svc.createCity(root, 't', { name: `Ver ${s}`, state: 'TS' });
    await svc.updateCity(root, 't', city.id, { name: `Ver2 ${s}`, version: city.version });
    await expectCode(svc.updateCity(root, 't', city.id, { name: `Ver3 ${s}`, version: city.version }), 'VERSION_CONFLICT');
  });

  it('writes an audit row for every change, attributed to the admin', async () => {
    const city = await svc.createCity(root, 'req-audit', { name: `Audit ${s}`, state: 'TS' });
    const row = await db
      .selectFrom('app.audit_events')
      .selectAll()
      .where('target_id', '=', city.id)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({ action: 'city.created', actor_id: root.id, actor_kind: 'admin', request_id: 'req-audit' });
  });
});
