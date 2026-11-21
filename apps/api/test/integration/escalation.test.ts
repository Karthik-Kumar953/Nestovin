import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { AppError } from '../../src/lib/errors';
import type { Database } from '../../src/db/database';
import { LocationService } from '../../src/modules/locations/service';
import { SupportService } from '../../src/modules/support/service';
import { escalateOverdue } from '../../src/modules/support/escalation';
import type { ResidentActor } from '../../src/modules/residents/auth';
import { actor } from '../helpers/fake-deps';
import { adminPool, appDatabase, databaseAvailable, uniq } from '../helpers/db';
import { cleanupSuite } from '../helpers/qa-fixtures';

/* Phase 7 (ADM-13, ADR-014): working-day deadlines, urgent path, manual and overdue escalation. */

const available = await databaseAvailable();

describe.skipIf(!available)('support escalation (Phase 7)', { timeout: 90_000 }, () => {
  let db: Database;
  let admin: pg.Pool;
  let support: SupportService;
  let categoryId: string;
  const s = uniq();
  const root = actor({ id: randomUUID(), scope: { type: 'GLOBAL' } });
  const R: ResidentActor = { id: randomUUID(), phone: `+9194${Math.floor(10_000_000 + Math.random() * 89_999_999)}` };

  beforeAll(async () => {
    db = appDatabase();
    admin = adminPool();
    support = new SupportService(db);
    const loc = new LocationService(db);
    const cityId = (await loc.createCity(root, 't', { name: `P7 City ${s}`, state: 'Telangana' })).id;
    const c1 = (await loc.createCluster(root, 't', { name: `P7 North ${s}`, code: `EN${s}` })).id;
    const community = (await loc.createCommunity(root, 't', { cityId, name: `P7 Alpha ${s}`, code: `EA${s}`, clusterId: c1 })).id;
    const tower = (await loc.createTower(root, 't', { communityId: community, name: 'T1' })).id;
    const flat = (await loc.createFlat(root, 't', { towerId: tower, flatNumber: '101' })).id;
    await admin.query(`insert into auth.users (id, phone, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [R.id, R.phone.slice(1)]);
    await admin.query(`insert into app.resident_profiles (id, phone, full_name) values ($1, $2, 'P7 Resident')`, [R.id, R.phone]);
    await admin.query(`insert into app.residence_memberships (resident_id, flat_id, kind, occupancy, status) values ($1, $2, 'PRIMARY', 'OWNER', 'VERIFIED')`, [R.id, flat]);
    categoryId = (await support.categories(db, true))[0]!.id;
  }, 120_000);

  afterAll(async () => {
    await db?.destroy();
    await admin?.end();
    // Last, so it never delays the suite's own resets (hook timeouts on a busy shared DB).
    // Removes this suite's fixtures from the shared dev database (test/helpers/qa-fixtures.ts).
    await cleanupSuite({ suffix: s });
  }, 180_000);

  const create = (subject: string) => support.residentCreate(R, 't', { categoryId, subject, description: 'Details of the problem' });

  it('a new ticket gets a working-day deadline and is not escalated', async () => {
    const t = await create('Deadline check');
    const d = await support.adminDetail(root, t.id);
    expect(d.escalationLevel).toBe('NONE');
    expect(d.dueAt).not.toBeNull();
    const hours = (new Date(d.dueAt!).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(47); // at least two calendar days away
  });

  it('urgent goes straight to the Cluster Admin; manual escalation then reaches the Super Admin', async () => {
    const t = await create('Urgent case');
    let d = await support.adminDetail(root, t.id);
    d = await support.adminPatch(root, 't', t.id, { urgent: true, version: d.version });
    expect(d.escalationLevel).toBe('CLUSTER_ADMIN');
    expect(d.escalations[0]).toMatchObject({ level: 'CLUSTER_ADMIN', trigger: 'URGENT' });
    d = await support.adminEscalate(root, 't', t.id, 'Needs a policy decision');
    expect(d.escalationLevel).toBe('SUPER_ADMIN');
    expect(d.dueAt).toBeNull();
    await expect(support.adminEscalate(root, 't', t.id, 'again')).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === 'BUSINESS_RULE_VIOLATION');
    // Residents never see the internal escalation notes.
    const mine = await support.residentDetail(R, t.id);
    expect(mine.updates.some((u) => /Escalated/.test(u.body))).toBe(false);
  });

  it('overdue tickets escalate automatically; resolved ones stop', async () => {
    const a = await create('Overdue one');
    const b = await create('Resolved one');
    const bd = await support.adminDetail(root, b.id);
    await support.adminPatch(root, 't', b.id, { status: 'RESOLVED', version: bd.version });
    await admin.query(`update app.support_tickets set next_escalation_at = now() - interval '1 minute' where id = any($1)`, [[a.id, b.id]]);
    await admin.query(`update app.support_tickets set status = 'RESOLVED' where id = $1`, [b.id]);
    await escalateOverdue(db);
    expect((await support.adminDetail(root, a.id)).escalationLevel).toBe('CLUSTER_ADMIN');
    expect((await support.adminDetail(root, b.id)).escalationLevel).toBe('NONE');
    const list = await support.adminList(root, { limit: 100, escalated: true });
    expect(list.items.some((t) => t.id === a.id)).toBe(true);
  });
});
