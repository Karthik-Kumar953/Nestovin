import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { AppError } from '../../src/lib/errors';
import type { Database } from '../../src/db/database';
import type { AuthAdminAdapter } from '../../src/integrations/auth-admin';
import { LocationService } from '../../src/modules/locations/service';
import { WorkforceAdminService } from '../../src/modules/workforce/admin-service';
import { AllocationService } from '../../src/modules/workforce/allocation';
import { EmployeeService, type EmployeeActor } from '../../src/modules/workforce/employee-service';
import { addDays } from '../../src/modules/bookings/pricing';
import { actor } from '../helpers/fake-deps';
import { adminPool, appDatabase, appPool, databaseAvailable, uniq } from '../helpers/db';

/*
 * Phase 5 (ADM-09/11, EMP-01/09, ADR-005/012): readiness, eligibility filters,
 * standing assignments, visit generation, leave and replacement, RLS.
 */

const available = await databaseAvailable();

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

describe.skipIf(!available)('workforce and allocation (Phase 5)', { timeout: 120_000 }, () => {
  let db: Database;
  let admin: pg.Pool;
  let app: pg.Pool;
  let hr: WorkforceAdminService;
  let alloc: AllocationService;
  let emp: EmployeeService;
  const s = uniq();
  const root = actor({ id: randomUUID(), scope: { type: 'GLOBAL' } });
  let c1: string;
  let c2: string;
  let maid: string;
  let itemId: string;
  let communityId: string;
  const comps: string[] = [];
  const subs: string[] = [];
  const e: Record<string, string> = {};
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = addDays(today, 1);

  const fakeAuth: AuthAdminAdapter = {
    async inviteUser() {
      throw new Error('not used');
    },
    async createStaffUser(email) {
      const id = randomUUID();
      await admin.query(`insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [id, email]);
      return { userId: id };
    },
    async setPassword() {},
    async deleteUser() {},
    async setBanned() {},
  };

  const phone = () => `+9196${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

  beforeAll(async () => {
    db = appDatabase();
    admin = adminPool();
    app = appPool(2);
    hr = new WorkforceAdminService(db, fakeAuth);
    alloc = new AllocationService(db);
    emp = new EmployeeService(db);
    const loc = new LocationService(db);
    const q = (t: string, p: unknown[] = []) => admin.query(t, p);

    const cityId = (await loc.createCity(root, 't', { name: `P5 City ${s}`, state: 'Telangana' })).id;
    c1 = (await loc.createCluster(root, 't', { name: `P5 North ${s}`, code: `WN${s}` })).id;
    c2 = (await loc.createCluster(root, 't', { name: `P5 South ${s}`, code: `WS${s}` })).id;
    const community = (communityId = (await loc.createCommunity(root, 't', { cityId, name: `P5 Alpha ${s}`, code: `WA${s}`, clusterId: c1 })).id);
    const tower = (await loc.createTower(root, 't', { communityId: community, name: 'T1' })).id;
    const flats = [(await loc.createFlat(root, 't', { towerId: tower, flatNumber: '101' })).id, (await loc.createFlat(root, 't', { towerId: tower, flatNumber: '102' })).id];
    await q(`update app.communities set status = 'ACTIVE' where id = $1`, [community]);
    maid = (await q(`select id from app.services where code = 'MAID'`)).rows[0].id;
    const cat = (await q(`insert into app.residence_categories (community_id, code, label) values ($1, '2BHK', '2 BHK') returning id`, [community])).rows[0].id;
    const ver = (await q(`insert into app.catalogue_versions (community_id, version_no) values ($1, 1) returning id`, [community])).rows[0].id;
    const plan = (await q(`insert into app.plans (catalogue_version_id, code, name, validity_days) values ($1, 'BASIC', 'Basic', 30) returning id`, [ver])).rows[0].id;
    await q(`update app.catalogue_versions set status = 'PUBLISHED', published_at = now() where id = $1`, [ver]);
    const slot = (await q(`insert into app.slots (community_id, mode, label, start_time, duration_minutes, capacity, status) values ($1, 'CONTINUOUS', 'Morning', '07:00', 60, 10, 'PUBLISHED') returning id`, [community])).rows[0].id;

    for (const flat of flats) {
      const rid = randomUUID();
      const ph = phone();
      await q(`insert into auth.users (id, phone, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [rid, ph.slice(1)]);
      await q(`insert into app.resident_profiles (id, phone, full_name) values ($1, $2, 'P5 Resident')`, [rid, ph]);
      const m = (await q(`insert into app.residence_memberships (resident_id, flat_id, kind, occupancy, status) values ($1, $2, 'PRIMARY', 'OWNER', 'VERIFIED') returning id, cluster_id`, [rid, flat])).rows[0];
      const snap = (
        await q(
          `insert into app.booking_terms_snapshots (resident_id, flat_id, community_id, cluster_id, catalogue_version_id, plan_id, residence_category_id, plan_snapshot, total_paise, initial_due_paise, remaining_due_paise, validity_days)
           values ($1, $2, $3, $4, $5, $6, $7, '{"planName":"Basic","selectionLabel":"Maid","components":[]}', 100000, 100000, 0, 30) returning id`,
          [rid, flat, community, m.cluster_id, ver, plan, cat],
        )
      ).rows[0].id;
      const b = (
        await q(
          `insert into app.bookings (mode, resident_id, membership_id, flat_id, community_id, cluster_id, terms_snapshot_id, slot_id, start_date, status, confirmed_at)
           values ('CONTINUOUS', $1, $2, $3, $4, $5, $6, $7, $8, 'CONFIRMED', now()) returning id`,
          [rid, m.id, flat, community, m.cluster_id, snap, slot, today],
        )
      ).rows[0].id;
      const sub = (
        await q(`insert into app.subscriptions (booking_id, resident_id, flat_id, community_id, cluster_id, period_start, period_end) values ($1, $2, $3, $4, $5, $6, $7) returning id`, [
          b, rid, flat, community, m.cluster_id, today, addDays(today, 29),
        ])
      ).rows[0].id;
      subs.push(sub);
      comps.push(
        (await q(`insert into app.subscription_components (subscription_id, cluster_id, service_id, start_time, duration_minutes, days_of_week, visits_per_day) values ($1, $2, $3, '07:00', 60, 127, 1) returning id`, [sub, m.cluster_id, maid]))
          .rows[0].id,
      );
    }

    itemId = (await q(`insert into app.verification_items (name) values ($1) returning id`, [`ID proof ${s}`])).rows[0].id;
  });

  afterAll(async () => {
    // Keep later suites independent of this suite's required checklist item.
    await admin?.query(`update app.verification_items set status = 'INACTIVE' where id = $1`, [itemId]).catch(() => undefined);
    await db?.destroy();
    await admin?.end();
    await app?.end();
  });

  /**
   * Readiness needs every ACTIVE required check. Other suites running in parallel on the shared dev
   * database add their own temporary checks, so verify all of them, not only this suite's.
   */
  async function verifyAllActiveChecks(employeeId: string) {
    const items = (await admin.query(`select id from app.verification_items where status = 'ACTIVE'`)).rows as { id: string }[];
    for (const it of items) await hr.setVerification(root, 't', employeeId, it.id, { status: 'VERIFIED' });
  }

  async function readyEmployee(name: string, cluster: string) {
    const d = await hr.createEmployee(root, 't', { fullName: name, phone: phone(), homeClusterId: cluster });
    await verifyAllActiveChecks(d.id);
    await hr.setQualifications(root, 't', d.id, [maid]);
    const after = await hr.detail(root, d.id);
    return (await hr.setReadiness(root, 't', d.id, { readiness: 'READY', version: after.version })).id;
  }

  it('applicants: public intake never creates a login; conversion creates an employee with an NV- code', async () => {
    const ph = phone();
    await hr.submitApplicant({ fullName: 'Applicant One', phone: ph, services: ['MAID'] }, 't');
    await hr.submitApplicant({ fullName: 'Applicant One', phone: ph, services: ['MAID'] }, 't'); // duplicate: same answer
    const list = (await hr.applicants(root, 'NEW')).filter((a) => a.phone === ph);
    expect(list).toHaveLength(1);
    const converted = await hr.convertApplicant(root, 't', list[0]!.id, { homeClusterId: c1, version: list[0]!.version });
    expect(converted.employeeCode).toMatch(/^NV-\d{6}$/);
    expect(converted.loginEnabled).toBe(false);
  });

  it('readiness needs the required checks and a qualification; login only after READY', async () => {
    const d = await hr.createEmployee(root, 't', { fullName: 'Not Ready', phone: phone(), homeClusterId: c1 });
    expect(d.readinessGaps.length).toBeGreaterThanOrEqual(2);
    await expectCode(hr.setReadiness(root, 't', d.id, { readiness: 'READY', version: d.version }), 'BUSINESS_RULE_VIOLATION');
    await expectCode(hr.enableLogin(root, 't', d.id), 'BUSINESS_RULE_VIOLATION');
    e.notReady = d.id;
    e.a = await readyEmployee('Asha', c1);
    e.b = await readyEmployee('Bina', c1);
    e.south = await readyEmployee('Sita', c2);
    const pw = await hr.enableLogin(root, 't', e.a);
    expect(pw.temporaryPassword).toMatch(/^[A-Za-z2-9]{12}$/);
    expect((await hr.detail(root, e.a)).loginEnabled).toBe(true);
    // A cluster-scoped admin elsewhere cannot see the employee.
    await expectCode(hr.detail(actor({ id: randomUUID(), scope: { type: 'CLUSTERS', clusterIds: [c2] } }), e.a), 'NOT_FOUND');
  });

  it('candidates apply the eligibility filters with reasons (no ranking)', async () => {
    const c = await alloc.candidates(root, comps[0]!);
    const ids = c.eligible.map((x) => x.employeeId);
    expect(ids).toEqual(expect.arrayContaining([e.a, e.b]));
    expect(ids).not.toContain(e.south); // other cluster is not even listed
    expect(c.excluded.find((x) => x.employeeId === e.notReady)?.reasons).toEqual(expect.arrayContaining(['Not deployment-ready', 'Not qualified for this service']));
  });

  it('confirming a standing assignment generates and assigns visits and activates the subscription', async () => {
    const r = await alloc.confirmStanding(root, 't', comps[0]!, { employeeId: e.a! });
    expect(r.assignedVisits).toBeGreaterThanOrEqual(14);
    const visits = await alloc.occurrences(root, { communityId, from: today, to: addDays(today, 3), unassignedOnly: false });
    const mine = visits.filter((v) => v.assignment?.employeeId === e.a);
    expect(mine.length).toBeGreaterThanOrEqual(3);
    expect(mine[0]!.startsAt).not.toBeNull();
    const { rows } = await admin.query(`select status from app.subscriptions where id = $1`, [subs[0]]);
    expect(rows[0].status).toBe('ACTIVE');
    // The same worker cannot hold a second service at the same time.
    await expectCode(alloc.confirmStanding(root, 't', comps[1]!, { employeeId: e.a! }), 'BUSINESS_RULE_VIOLATION');
    await alloc.confirmStanding(root, 't', comps[1]!, { employeeId: e.b! });
  });

  it('the database refuses a double-booked employee', async () => {
    const { rows } = await admin.query(
      `select o.id, o.starts_at, o.ends_at, o.cluster_id from app.service_occurrences o where o.subscription_component_id = $1 and o.scheduled_date = $2`,
      [comps[1], tomorrow],
    );
    const o = rows[0];
    await expect(
      admin.query(`insert into app.occurrence_assignments (occurrence_id, employee_id, cluster_id, source, starts_at, ends_at) values ($1, $2, $3, 'MANUAL', $4, $5)`, [
        o.id, e.a, o.cluster_id, o.starts_at, o.ends_at,
      ]),
    ).rejects.toThrow(/no_overlap|one_active_assignment/);
  });

  it('approved leave releases visits; replacement only offers eligible workers', async () => {
    const asha: EmployeeActor = { id: e.a!, employeeCode: 'x', clusterId: c1, mustChangePassword: false };
    const leave = await emp.requestLeave(asha, { startDate: tomorrow, endDate: tomorrow, reason: 'Family function' });
    await expect(emp.requestLeave(asha, { startDate: tomorrow, endDate: tomorrow })).rejects.toThrow(/already/);
    const pending = (await hr.leaveRequests(root, 'PENDING')).find((l) => l.id === leave[0]!.id)!;
    expect(pending.affectedAssignments).toBe(1);
    const decided = await hr.decideLeave(root, 't', pending.id, { decision: 'APPROVED', version: pending.version });
    expect(decided.releasedAssignments).toBe(1);

    const gap = (await alloc.occurrences(root, { communityId, from: tomorrow, to: tomorrow, unassignedOnly: true })).find((v) => v.flat.flatNumber === '101')!;
    expect(gap).toBeDefined();
    const cands = await alloc.occurrenceCandidates(root, gap.id);
    expect(cands.excluded.find((x) => x.employeeId === e.a)?.reasons.join(' ')).toMatch(/leave/);
    expect(cands.excluded.find((x) => x.employeeId === e.b)?.reasons.join(' ')).toMatch(/overlaps/);
    await expectCode(alloc.assignOccurrence(root, 't', gap.id, { employeeId: e.b!, reason: 'cover' }), 'BUSINESS_RULE_VIOLATION');
    e.c = await readyEmployee('Chitra', c1);
    await alloc.assignOccurrence(root, 't', gap.id, { employeeId: e.c, reason: 'Covering approved leave' });
    const covered = (await alloc.occurrences(root, { communityId, from: tomorrow, to: tomorrow, unassignedOnly: false })).find((v) => v.id === gap.id)!;
    expect(covered.assignment).toMatchObject({ employeeId: e.c, source: 'MANUAL' });
  });

  it('workers see only their own schedule (RLS)', async () => {
    const bina: EmployeeActor = { id: e.b!, employeeCode: 'x', clusterId: c1, mustChangePassword: false };
    const sched = await emp.schedule(bina, today, addDays(today, 3));
    expect(sched.length).toBeGreaterThanOrEqual(3);
    expect(sched.every((x) => x.flat.flatNumber === '102')).toBe(true);
    const client = await app.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('app.user_id', $1, true), set_config('app.actor_kind', 'employee', true)`, [e.b]);
      const others = await client.query(`select count(*)::int as n from app.employees where id <> $1`, [e.b]);
      const leave = await client.query(`select count(*)::int as n from app.leave_requests where employee_id <> $1`, [e.b]);
      expect([others.rows[0].n, leave.rows[0].n]).toEqual([0, 0]);
      await client.query('rollback');
    } finally {
      client.release();
    }
  });

  it('a permanent replacement moves future standing visits but keeps one-day covers', async () => {
    const r = await alloc.confirmStanding(root, 't', comps[0]!, { employeeId: e.c!, reason: 'Asha moved to another community' });
    expect(r.assignedVisits).toBeGreaterThan(0);
    const visits = await alloc.occurrences(root, { communityId, from: today, to: addDays(today, 5), unassignedOnly: false });
    const flat101 = visits.filter((v) => v.flat.flatNumber === '101' && v.scheduledDate > today);
    expect(flat101.every((v) => v.assignment?.employeeId === e.c)).toBe(true);
    const needs = await alloc.needs(root, { unassignedOnly: false });
    expect(needs.find((n) => n.componentId === comps[0])?.standing?.employeeId).toBe(e.c);
    await expectCode(hr.setReadiness(root, 't', e.c!, { readiness: 'NOT_READY', version: (await hr.detail(root, e.c!)).version }), 'BUSINESS_RULE_VIOLATION');
  });
});
