import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { AppError } from '../../src/lib/errors';
import { withTx, type Database } from '../../src/db/database';
import type { AuthAdminAdapter } from '../../src/integrations/auth-admin';
import { LocationService } from '../../src/modules/locations/service';
import { WorkforceAdminService } from '../../src/modules/workforce/admin-service';
import { generateOccurrences } from '../../src/modules/workforce/allocation';
import { OvertimeService } from '../../src/modules/workforce/overtime';
import type { EmployeeActor } from '../../src/modules/workforce/employee-service';
import { SYSTEM_CLAIMS } from '../../src/modules/bookings/payments';
import { addDays } from '../../src/modules/bookings/pricing';
import { actor } from '../helpers/fake-deps';
import { adminPool, appDatabase, databaseAvailable, uniq } from '../helpers/db';
import { cleanupSuite, makeReadyTolerant } from '../helpers/qa-fixtures';

/* EMP-08: offer -> accept/reject -> admin confirmation creates the schedule entry. */

const available = await databaseAvailable();

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

describe.skipIf(!available)('overtime offers (EMP-08)', { timeout: 120_000 }, () => {
  let db: Database;
  let admin: pg.Pool;
  let ot: OvertimeService;
  let visitId: string;
  let itemId: string;
  const s = uniq();
  const root = actor({ id: randomUUID(), scope: { type: 'GLOBAL' } });
  const workers: EmployeeActor[] = [];

  beforeAll(async () => {
    db = appDatabase();
    admin = adminPool();
    ot = new OvertimeService(db);
    const fakeAuth: AuthAdminAdapter = { async inviteUser() { throw new Error('x'); }, async createStaffUser() { throw new Error('x'); }, async setPassword() {}, async deleteUser() {}, async setBanned() {} };
    const hr = new WorkforceAdminService(db, fakeAuth);
    const loc = new LocationService(db);
    const q = (t: string, p: unknown[] = []) => admin.query(t, p);
    const today = new Date().toISOString().slice(0, 10);
    const cityId = (await loc.createCity(root, 't', { name: `OT City ${s}`, state: 'Telangana' })).id;
    const c1 = (await loc.createCluster(root, 't', { name: `OT North ${s}`, code: `ON${s}` })).id;
    const community = (await loc.createCommunity(root, 't', { cityId, name: `OT Homes ${s}`, code: `OH${s}`, clusterId: c1 })).id;
    const tower = (await loc.createTower(root, 't', { communityId: community, name: 'T1' })).id;
    const flat = (await loc.createFlat(root, 't', { towerId: tower, flatNumber: '101' })).id;
    await q(`update app.communities set status = 'ACTIVE' where id = $1`, [community]);
    const maid = (await q(`select id from app.services where code = 'MAID'`)).rows[0].id;
    const cat = (await q(`insert into app.residence_categories (community_id, code, label) values ($1, 'X', 'X') returning id`, [community])).rows[0].id;
    const ver = (await q(`insert into app.catalogue_versions (community_id, version_no) values ($1, 1) returning id`, [community])).rows[0].id;
    const plan = (await q(`insert into app.plans (catalogue_version_id, code, name, validity_days) values ($1, 'P', 'P', 30) returning id`, [ver])).rows[0].id;
    await q(`update app.catalogue_versions set status = 'PUBLISHED', published_at = now() where id = $1`, [ver]);
    const slot = (await q(`insert into app.slots (community_id, mode, label, start_time, duration_minutes, capacity, status) values ($1, 'CONTINUOUS', 'S', '18:00', 60, 5, 'PUBLISHED') returning id`, [community])).rows[0].id;
    const rid = randomUUID();
    const ph = `+9191${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
    await q(`insert into auth.users (id, phone, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [rid, ph.slice(1)]);
    await q(`insert into app.resident_profiles (id, phone) values ($1, $2)`, [rid, ph]);
    const m = (await q(`insert into app.residence_memberships (resident_id, flat_id, kind, occupancy, status) values ($1, $2, 'PRIMARY', 'OWNER', 'VERIFIED') returning id, cluster_id`, [rid, flat])).rows[0];
    const snap = (await q(`insert into app.booking_terms_snapshots (resident_id, flat_id, community_id, cluster_id, catalogue_version_id, plan_id, residence_category_id, plan_snapshot, total_paise, initial_due_paise, remaining_due_paise, validity_days) values ($1,$2,$3,$4,$5,$6,$7,'{}',100,100,0,30) returning id`, [rid, flat, community, m.cluster_id, ver, plan, cat])).rows[0].id;
    const b = (await q(`insert into app.bookings (mode, resident_id, membership_id, flat_id, community_id, cluster_id, terms_snapshot_id, slot_id, start_date, status) values ('CONTINUOUS',$1,$2,$3,$4,$5,$6,$7,$8,'CONFIRMED') returning id`, [rid, m.id, flat, community, m.cluster_id, snap, slot, today])).rows[0].id;
    const sub = (await q(`insert into app.subscriptions (booking_id, resident_id, flat_id, community_id, cluster_id, period_start, period_end) values ($1,$2,$3,$4,$5,$6,$7) returning id`, [b, rid, flat, community, m.cluster_id, today, addDays(today, 10)])).rows[0].id;
    const comp = (await q(`insert into app.subscription_components (subscription_id, cluster_id, service_id, start_time, duration_minutes, days_of_week, visits_per_day) values ($1,$2,$3,'18:00',60,127,1) returning id`, [sub, m.cluster_id, maid])).rows[0].id;
    await withTx(db, SYSTEM_CLAIMS, (trx) => generateOccurrences(trx, { subscriptionId: sub }));
    visitId = (await q(`select id from app.service_occurrences where subscription_component_id = $1 order by scheduled_date offset 1 limit 1`, [comp])).rows[0].id;
    itemId = (await q(`insert into app.verification_items (name) values ($1) returning id`, [`OT check ${s}`])).rows[0].id;
    for (const name of ['Asha', 'Bina', 'Chitra']) {
      const d = await hr.createEmployee(root, 't', { fullName: `${name} ${s}`, phone: `+9190${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, homeClusterId: c1 });
      await hr.setVerification(root, 't', d.id, itemId, { status: 'VERIFIED' });
      await hr.setQualifications(root, 't', d.id, [maid]);
      // Other worktrees may have their own required items active on the shared DB.
      if (name !== 'Chitra') await makeReadyTolerant(hr, admin, root, d.id);
      workers.push({ id: d.id, employeeCode: d.employeeCode, clusterId: c1, mustChangePassword: false });
    }
  }, 180_000);

  afterAll(async () => {
    await admin?.query(`update app.verification_items set status = 'INACTIVE' where id = $1`, [itemId]).catch(() => undefined);
    await db?.destroy();
    await admin?.end();
    // Last, so it never delays the suite's own resets (hook timeouts on a busy shared DB).
    // Removes this suite's fixtures from the shared dev database (test/helpers/qa-fixtures.ts).
    await cleanupSuite({ suffix: s });
  }, 180_000);

  it('offers only to safe candidates; acceptance alone is not an assignment', async () => {
    const c = await ot.candidates(root, visitId);
    expect(c.eligible.map((e) => e.employeeId)).toEqual(expect.arrayContaining([workers[0]!.id, workers[1]!.id]));
    expect(c.excluded.find((e) => e.employeeId === workers[2]!.id)?.reasons).toContain('Not deployment-ready');
    await expectCode(ot.offer(root, 't', visitId, { employeeIds: [workers[2]!.id] }), 'BUSINESS_RULE_VIOLATION');
    const offer = await ot.offer(root, 't', visitId, { employeeIds: [workers[0]!.id, workers[1]!.id], note: 'Evening cover' });
    await expectCode(ot.offer(root, 't', visitId, { employeeIds: [workers[0]!.id] }), 'CONFLICT');
    await ot.respond(workers[0]!, offer.id, 'REJECTED');
    const mine = await ot.respond(workers[1]!, offer.id, 'ACCEPTED');
    expect(mine[0]!.responses).toHaveLength(1); // a worker sees only their own response
    const { rows } = await admin.query(`select count(*)::int as n from app.occurrence_assignments where occurrence_id = $1 and status = 'ACTIVE'`, [visitId]);
    expect(rows[0].n).toBe(0);
  });

  it('confirmation of an acceptance creates the overtime assignment and closes the offer', async () => {
    const [offer] = await ot.list(root, 'OPEN');
    const mineOffer = (await ot.list(root, 'OPEN')).find((o) => o.visit.occurrenceId === visitId) ?? offer!;
    await expectCode(ot.confirm(root, 't', mineOffer.id, workers[0]!.id), 'BUSINESS_RULE_VIOLATION'); // rejected
    const done = await ot.confirm(root, 't', mineOffer.id, workers[1]!.id);
    expect(done).toMatchObject({ status: 'FILLED', confirmedEmployeeId: workers[1]!.id });
    const { rows } = await admin.query(`select source, employee_id from app.occurrence_assignments where occurrence_id = $1 and status = 'ACTIVE'`, [visitId]);
    expect(rows[0]).toMatchObject({ source: 'OVERTIME', employee_id: workers[1]!.id });
    await expectCode(ot.respond(workers[0]!, mineOffer.id, 'ACCEPTED'), 'BUSINESS_RULE_VIOLATION'); // closed
  });
});
