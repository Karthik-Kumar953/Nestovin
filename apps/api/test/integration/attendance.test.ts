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
import { AttendanceService } from '../../src/modules/attendance/service';
import type { ResidentActor } from '../../src/modules/residents/auth';
import { addDays } from '../../src/modules/bookings/pricing';
import { actor } from '../helpers/fake-deps';
import { adminPool, appDatabase, databaseAvailable, uniq } from '../helpers/db';

/* Phase 6 (EMP-06/07, RES-10/11, ADM-12/12A, ADR-014). */

const available = await databaseAvailable();

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

/** HH:MM in Asia/Kolkata, `minutes` from now (clamped to today). */
function istTime(minutes: number): string {
  const d = new Date(Date.now() + minutes * 60_000);
  const t = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  const nowIst = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  return minutes < 0 && t > nowIst ? '00:00' : t;
}

describe.skipIf(!available)('attendance and service records (Phase 6)', { timeout: 120_000 }, () => {
  let db: Database;
  let admin: pg.Pool;
  let att: AttendanceService;
  let itemId: string;
  const s = uniq();
  const root = actor({ id: randomUUID(), scope: { type: 'GLOBAL' } });
  const residents: ResidentActor[] = [];
  const workers: EmployeeActor[] = [];
  const occ: string[] = [];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const phone = () => `+9195${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

  beforeAll(async () => {
    db = appDatabase();
    admin = adminPool();
    att = new AttendanceService(db, 'test-pepper-0123456789');
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
    const hr = new WorkforceAdminService(db, fakeAuth);
    const alloc = new AllocationService(db);
    const loc = new LocationService(db);
    const q = (t: string, p: unknown[] = []) => admin.query(t, p);

    const cityId = (await loc.createCity(root, 't', { name: `P6 City ${s}`, state: 'Telangana' })).id;
    const c1 = (await loc.createCluster(root, 't', { name: `P6 North ${s}`, code: `AN${s}` })).id;
    const community = (await loc.createCommunity(root, 't', { cityId, name: `P6 Alpha ${s}`, code: `AA${s}`, clusterId: c1 })).id;
    const tower = (await loc.createTower(root, 't', { communityId: community, name: 'T1' })).id;
    const flats = [];
    for (const n of ['101', '102', '103']) flats.push((await loc.createFlat(root, 't', { towerId: tower, flatNumber: n })).id);
    await q(`update app.communities set status = 'ACTIVE', location_lat = 17.440000, location_lng = 78.380000 where id = $1`, [community]);
    const maid = (await q(`select id from app.services where code = 'MAID'`)).rows[0].id;
    const cat = (await q(`insert into app.residence_categories (community_id, code, label) values ($1, '2BHK', '2 BHK') returning id`, [community])).rows[0].id;
    const ver = (await q(`insert into app.catalogue_versions (community_id, version_no) values ($1, 1) returning id`, [community])).rows[0].id;
    const plan = (await q(`insert into app.plans (catalogue_version_id, code, name, validity_days) values ($1, 'BASIC', 'Basic', 30) returning id`, [ver])).rows[0].id;
    await q(`update app.catalogue_versions set status = 'PUBLISHED', published_at = now() where id = $1`, [ver]);
    const slot = (await q(`insert into app.slots (community_id, mode, label, start_time, duration_minutes, capacity, status) values ($1, 'CONTINUOUS', 'Any', '07:00', 60, 10, 'PUBLISHED') returning id`, [community])).rows[0].id;
    itemId = (await q(`insert into app.verification_items (name) values ($1) returning id`, [`P6 check ${s}`])).rows[0].id;

    const starts = [istTime(60), istTime(-30), istTime(120)];
    const comps: string[] = [];
    for (let i = 0; i < 3; i++) {
      const rid = randomUUID();
      const ph = phone();
      residents.push({ id: rid, phone: ph });
      await q(`insert into auth.users (id, phone, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [rid, ph.slice(1)]);
      await q(`insert into app.resident_profiles (id, phone, full_name) values ($1, $2, 'P6 Resident')`, [rid, ph]);
      const m = (await q(`insert into app.residence_memberships (resident_id, flat_id, kind, occupancy, status) values ($1, $2, 'PRIMARY', 'OWNER', 'VERIFIED') returning id, cluster_id`, [rid, flats[i]])).rows[0];
      const snap = (
        await q(
          `insert into app.booking_terms_snapshots (resident_id, flat_id, community_id, cluster_id, catalogue_version_id, plan_id, residence_category_id, plan_snapshot, total_paise, initial_due_paise, remaining_due_paise, validity_days)
           values ($1, $2, $3, $4, $5, $6, $7, $8, 100000, 100000, 0, 30) returning id`,
          [
            rid,
            flats[i],
            community,
            m.cluster_id,
            ver,
            plan,
            cat,
            JSON.stringify({
              planName: 'Basic',
              selectionLabel: 'Maid',
              components: [{ serviceId: maid, isAddon: false, tasks: [{ name: 'Sweeping and mopping', frequency: 'PER_VISIT', timesPerPeriod: 1 }, { name: 'Bathroom deep clean', frequency: 'WEEKLY', timesPerPeriod: 1 }] }],
            }),
          ],
        )
      ).rows[0].id;
      const b = (
        await q(
          `insert into app.bookings (mode, resident_id, membership_id, flat_id, community_id, cluster_id, terms_snapshot_id, slot_id, start_date, status) values ('CONTINUOUS', $1, $2, $3, $4, $5, $6, $7, $8, 'CONFIRMED') returning id`,
          [rid, m.id, flats[i], community, m.cluster_id, snap, slot, today],
        )
      ).rows[0].id;
      const sub = (await q(`insert into app.subscriptions (booking_id, resident_id, flat_id, community_id, cluster_id, period_start, period_end) values ($1, $2, $3, $4, $5, $6, $7) returning id`, [b, rid, flats[i], community, m.cluster_id, today, addDays(today, 29)])).rows[0].id;
      comps.push((await q(`insert into app.subscription_components (subscription_id, cluster_id, service_id, start_time, duration_minutes, days_of_week, visits_per_day) values ($1, $2, $3, $4, 30, 127, 1) returning id`, [sub, m.cluster_id, maid, starts[i]])).rows[0].id);
    }
    for (const name of ['Asha', 'Bina']) {
      const d = await hr.createEmployee(root, 't', { fullName: name, phone: phone(), homeClusterId: c1 });
      // Readiness needs every ACTIVE check; parallel suites on the shared dev DB add their own, so verify all.
      for (const it of (await q(`select id from app.verification_items where status = 'ACTIVE'`)).rows as { id: string }[]) {
        await hr.setVerification(root, 't', d.id, it.id, { status: 'VERIFIED' });
      }
      await hr.setQualifications(root, 't', d.id, [maid]);
      const v = (await hr.detail(root, d.id)).version;
      await hr.setReadiness(root, 't', d.id, { readiness: 'READY', version: v });
      workers.push({ id: d.id, employeeCode: d.employeeCode, clusterId: c1, mustChangePassword: false });
    }
    await alloc.confirmStanding(root, 't', comps[0]!, { employeeId: workers[0]!.id });
    await alloc.confirmStanding(root, 't', comps[1]!, { employeeId: workers[1]!.id });
    for (const c of comps.slice(0, 2)) occ.push((await q(`select id from app.service_occurrences where subscription_component_id = $1 and scheduled_date = $2`, [c, today])).rows[0].id);
  }, 180_000);

  afterAll(async () => {
    await admin?.query(`update app.verification_items set status = 'INACTIVE' where id = $1`, [itemId]).catch(() => undefined);
    await db?.destroy();
    await admin?.end();
  });

  it('the household sees today’s visit with the worker’s first name and can show a code', async () => {
    const visits = await att.residentVisits(residents[0]!, today, today);
    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({ status: 'ASSIGNED', workerName: 'Asha', canShowCode: true });
    await expectCode(att.issueCode(residents[2]!, occ[0]!), 'NOT_FOUND'); // another household
  });

  it('check-in: wrong code is rejected and recorded; QR works; GPS outside the radius is flagged, not blocked', async () => {
    const code = await att.issueCode(residents[0]!, occ[0]!);
    expect(code.otp).toMatch(/^\d{6}$/);
    const wrong = code.otp === '000000' ? '111111' : '000000';
    await expectCode(att.checkIn(workers[0]!, occ[0]!, { method: 'OTP', code: wrong, clientEventId: `evt-${randomUUID()}` }), 'BUSINESS_RULE_VIOLATION');
    await expectCode(att.checkIn(workers[1]!, occ[0]!, { method: 'QR', code: code.qr, clientEventId: `evt-${randomUUID()}` }), 'NOT_FOUND'); // not their visit
    const eventId = `evt-${randomUUID()}`;
    const ok = await att.checkIn(workers[0]!, occ[0]!, { method: 'QR', code: code.qr, lat: 17.47, lng: 78.38, accuracyM: 12, clientEventId: eventId });
    expect(ok).toMatchObject({ result: 'VERIFIED', flags: ['OUTSIDE_RADIUS'] });
    // A retry of the same attempt returns the same outcome.
    expect((await att.checkIn(workers[0]!, occ[0]!, { method: 'QR', code: code.qr, clientEventId: eventId })).result).toBe('VERIFIED');
    // The used code cannot be replayed for another check-in.
    await expectCode(att.checkIn(workers[0]!, occ[0]!, { method: 'OTP', code: code.otp, clientEventId: `evt-${randomUUID()}` }), 'BUSINESS_RULE_VIOLATION');
  });

  it('attendance evidence cannot be edited', async () => {
    await expect(admin.query(`update app.attendance_events set lat = 17.44 where occurrence_id = $1 and result = 'VERIFIED'`, [occ[0]])).rejects.toThrow(/cannot be changed/);
  });

  it('completion, resident feedback once, and the flagged record in ADM-12', async () => {
    await att.complete(workers[0]!, occ[0]!, 'All tasks done');
    const visits = await att.residentVisits(residents[0]!, today, today);
    expect(visits[0]!.status).toBe('COMPLETED');
    expect(visits[0]!.checkedInAt).not.toBeNull();
    await att.feedback(residents[0]!, 't', occ[0]!, { rating: 5, comment: 'On time and thorough' });
    await expectCode(att.feedback(residents[0]!, 't', occ[0]!, { rating: 4 }), 'CONFLICT');

    const flagged = await att.records(root, { from: today, to: today, flaggedOnly: true });
    const rec = flagged.find((r) => r.occurrenceId === occ[0])!;
    expect(rec.checkIn).toMatchObject({ flags: ['OUTSIDE_RADIUS'], reviewStatus: 'OPEN' });
    expect(rec.checkIn!.distanceM).toBeGreaterThan(3000);
    expect(rec.rejectedAttempts).toBeGreaterThanOrEqual(1);
    expect(rec.feedback).toMatchObject({ rating: 5 });
    await att.reviewFlag(root, 't', rec.checkIn!.eventId, { decision: 'ACCEPTED', note: 'Gate GPS drift, resident confirmed by phone' });
  });

  it('resident no-show after the wait; correction request is reviewed with the original kept', async () => {
    await att.residentAbsent(workers[1]!, occ[1]!, { note: 'Rang the bell, no answer' });
    const rec = (await att.records(root, { from: today, to: today, flaggedOnly: true })).find((r) => r.occurrenceId === occ[1])!;
    expect(rec.noShow).toMatchObject({ kind: 'RESIDENT_ABSENT' });
    await att.requestCorrection(workers[1]!, occ[1]!, { requestedChange: 'MARK_ATTENDED', explanation: 'Resident came back after 20 minutes' });
    await expectCode(att.requestCorrection(workers[1]!, occ[1]!, { requestedChange: 'MARK_ATTENDED', explanation: 'Again please' }), 'CONFLICT');
    const pending = (await att.corrections(root, 'PENDING')).find((c) => c.occurrenceId === occ[1])!;
    await att.decideCorrection(root, 't', pending.id, { decision: 'APPROVED', note: 'Resident confirmed by phone' });
    const { rows } = await admin.query(`select status from app.service_occurrences where id = $1`, [occ[1]]);
    expect(rows[0].status).toBe('IN_PROGRESS');
    const kept = await admin.query(`select count(*)::int as n from app.no_show_records where occurrence_id = $1`, [occ[1]]);
    expect(kept.rows[0].n).toBe(1);
  });

  it('Worker app: schedule lists the agreed tasks; visit detail shows attendance state; other workers get 404', async () => {
    const emp = new EmployeeService(db);
    const items = await emp.schedule(workers[0]!, today, today);
    const mine = items.find((i) => i.occurrenceId === occ[0])!;
    expect(mine).toMatchObject({ serviceName: expect.any(String), durationMinutes: 30, isAddon: false });
    expect(mine.tasks).toEqual([
      { name: 'Sweeping and mopping', frequency: 'PER_VISIT', timesPerPeriod: 1 },
      { name: 'Bathroom deep clean', frequency: 'WEEKLY', timesPerPeriod: 1 },
    ]);
    const detail = await emp.visit(workers[0]!, occ[0]!);
    expect(detail.checkIn).toMatchObject({ method: 'QR', result: 'VERIFIED', flags: ['OUTSIDE_RADIUS'] });
    expect(detail.completedAt).not.toBeNull();
    expect(detail.noShow).toBeNull();
    const absent = await emp.visit(workers[1]!, occ[1]!);
    expect(absent).toMatchObject({ noShow: 'RESIDENT_ABSENT', correction: { status: 'APPROVED', requestedChange: 'MARK_ATTENDED' } });
    await expectCode(emp.visit(workers[1]!, occ[0]!), 'NOT_FOUND');
    const me = await emp.me(workers[0]!);
    expect(me.homeClusterName).toMatch(/^P6 North/);
  });
});
