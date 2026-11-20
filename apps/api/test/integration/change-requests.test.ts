import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { AppError } from '../../src/lib/errors';
import type { Database } from '../../src/db/database';
import { LocationService } from '../../src/modules/locations/service';
import { ChangeRequestService } from '../../src/modules/residents/change-requests';
import type { ResidentActor } from '../../src/modules/residents/auth';
import { actor } from '../helpers/fake-deps';
import { adminPool, appDatabase, databaseAvailable, uniq } from '../helpers/db';

/* RES-14: verified residence data changes only through reviewed requests. */

const available = await databaseAvailable();

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

describe.skipIf(!available)('resident change requests (RES-14)', { timeout: 90_000 }, () => {
  let db: Database;
  let admin: pg.Pool;
  let svc: ChangeRequestService;
  let c1: string;
  let c2: string;
  const s = uniq();
  const root = actor({ id: randomUUID(), scope: { type: 'GLOBAL' } });
  const phone = () => `+9192${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const P: ResidentActor = { id: randomUUID(), phone: phone() };
  const F: ResidentActor = { id: randomUUID(), phone: phone() };
  const O: ResidentActor = { id: randomUUID(), phone: phone() };

  beforeAll(async () => {
    db = appDatabase();
    admin = adminPool();
    svc = new ChangeRequestService(db);
    const loc = new LocationService(db);
    const cityId = (await loc.createCity(root, 't', { name: `CR City ${s}`, state: 'Telangana' })).id;
    c1 = (await loc.createCluster(root, 't', { name: `CR North ${s}`, code: `CN${s}` })).id;
    c2 = (await loc.createCluster(root, 't', { name: `CR South ${s}`, code: `CS${s}` })).id;
    const community = (await loc.createCommunity(root, 't', { cityId, name: `CR Homes ${s}`, code: `CH${s}`, clusterId: c1 })).id;
    const tower = (await loc.createTower(root, 't', { communityId: community, name: 'T1' })).id;
    const flat = (await loc.createFlat(root, 't', { towerId: tower, flatNumber: '101' })).id;
    const flat2 = (await loc.createFlat(root, 't', { towerId: tower, flatNumber: '102' })).id;
    for (const r of [P, F, O]) {
      await admin.query(`insert into auth.users (id, phone, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [r.id, r.phone.slice(1)]);
      await admin.query(`insert into app.resident_profiles (id, phone) values ($1, $2)`, [r.id, r.phone]);
    }
    const pm = (await admin.query(`insert into app.residence_memberships (resident_id, flat_id, kind, occupancy, status) values ($1, $2, 'PRIMARY', 'TENANT', 'VERIFIED') returning id`, [P.id, flat])).rows[0].id;
    await admin.query(`insert into app.residence_memberships (resident_id, flat_id, kind, occupancy, status, primary_membership_id) values ($1, $2, 'FAMILY', 'FAMILY', 'VERIFIED', $3)`, [F.id, flat, pm]);
    await admin.query(`insert into app.residence_memberships (resident_id, flat_id, kind, occupancy, status) values ($1, $2, 'PRIMARY', 'OWNER', 'VERIFIED')`, [O.id, flat2]);
  }, 120_000);

  afterAll(async () => {
    await db?.destroy();
    await admin?.end();
  });

  it('occupancy change: Primary only, one pending at a time, applied on approval', async () => {
    await expectCode(svc.create(F, 't', { kind: 'OCCUPANCY_CHANGE', occupancy: 'OWNER' }), 'BUSINESS_RULE_VIOLATION');
    await expectCode(svc.create(P, 't', { kind: 'OCCUPANCY_CHANGE', occupancy: 'TENANT' }), 'BUSINESS_RULE_VIOLATION'); // already tenant
    const mine = await svc.create(P, 't', { kind: 'OCCUPANCY_CHANGE', occupancy: 'OWNER', reason: 'Bought the flat' });
    await expectCode(svc.create(P, 't', { kind: 'OCCUPANCY_CHANGE', occupancy: 'OWNER' }), 'CONFLICT');
    expect((await svc.mine(O)).length).toBe(0); // other households never see it
    const south = actor({ id: randomUUID(), scope: { type: 'CLUSTERS', clusterIds: [c2] } });
    expect((await svc.list(south, 'PENDING')).some((r) => r.id === mine[0]!.id)).toBe(false);
    await expectCode(svc.decide(south, 't', mine[0]!.id, { decision: 'APPROVED', note: 'ok ok' }), 'NOT_FOUND');
    await svc.decide(actor({ id: randomUUID(), scope: { type: 'CLUSTERS', clusterIds: [c1] } }), 't', mine[0]!.id, { decision: 'APPROVED', note: 'Sale deed checked' });
    const { rows } = await admin.query(`select occupancy from app.residence_memberships where resident_id = $1`, [P.id]);
    expect(rows[0].occupancy).toBe('OWNER');
  });

  it('move-out by the Primary ends the residence and the family’s access', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await expectCode(svc.create(P, 't', { kind: 'MOVE_OUT', moveOutDate: '2000-01-01' }), 'BUSINESS_RULE_VIOLATION');
    const req = (await svc.create(P, 't', { kind: 'MOVE_OUT', moveOutDate: today }))[0]!;
    await svc.decide(root, 't', req.id, { decision: 'APPROVED', note: 'Keys handed over' });
    const { rows } = await admin.query(`select resident_id, status from app.residence_memberships where resident_id = any($1)`, [[P.id, F.id]]);
    expect(rows.every((r: { status: string }) => r.status === 'ENDED')).toBe(true);
  });
});
