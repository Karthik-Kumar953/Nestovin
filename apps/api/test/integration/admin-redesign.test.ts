import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { GrantKey } from '@nestovin/contracts';
import { AppError } from '../../src/lib/errors';
import type { Database } from '../../src/db/database';
import { LocationService } from '../../src/modules/locations/service';
import { CatalogueService } from '../../src/modules/catalogue/service';
import { MigrationService } from '../../src/modules/migration/service';
import { SupportService } from '../../src/modules/support/service';
import { ResidentAdminService } from '../../src/modules/residents/admin-service';
import { AttendanceService } from '../../src/modules/attendance/service';
import { buildDashboard } from '../../src/modules/overview/dashboard';
import type { ResidentActor } from '../../src/modules/residents/auth';
import { actor, fakeDeps } from '../helpers/fake-deps';
import { adminPool, appDatabase, databaseAvailable } from '../helpers/db';
import { Fixtures, commercialFixture } from '../helpers/qa-fixtures';

/*
 * Admin Portal redesign backend against the real database (RLS, triggers):
 * ADM-03 cluster membership, ADM-13 ticket assignment + context, ADM-05 resident
 * edit/bookings, ADM-04 import row paging, ADM-12 feedback, ADM-01 dashboard.
 * Every fixture carries this suite's suffix and is removed in afterAll.
 */

const available = await databaseAvailable();

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

describe.skipIf(!available)('admin portal redesign endpoints', { timeout: 180_000 }, () => {
  let db: Database;
  let admin: pg.Pool;
  let fx: Fixtures;
  let f: Awaited<ReturnType<typeof commercialFixture>>;
  let loc: LocationService;
  let support: SupportService;
  let A: ResidentActor;
  let ticketId: string;
  const root = actor({ id: randomUUID(), isSuperAdmin: true, scope: { type: 'GLOBAL' } });
  const all: GrantKey[] = [
    'support:view',
    'support:edit',
    'residents:view',
    'residents:edit',
    'locations:view',
    'locations:edit',
    'attendance:view',
    'demand_payments:view',
    'employees:view',
    'allocation:view',
  ];
  const north = () =>
    actor({ id: randomUUID(), grants: all, scope: { type: 'CLUSTERS', clusterIds: [f.north] } });
  const south = () =>
    actor({ id: randomUUID(), grants: all, scope: { type: 'CLUSTERS', clusterIds: [f.south] } });
  /** Admin profiles created for the assignment tests: x/g eligible, y (other cluster) and z (view only) not. */
  const adm: Record<'x' | 'y' | 'z' | 'g', string> = {
    x: randomUUID(),
    y: randomUUID(),
    z: randomUUID(),
    g: randomUUID(),
  };

  beforeAll(async () => {
    db = appDatabase();
    admin = adminPool();
    fx = new Fixtures(admin);
    f = await commercialFixture(fx, db, actor({ id: randomUUID(), scope: { type: 'GLOBAL' } }), 2);
    loc = new LocationService(db);
    support = new SupportService(db);
    A = await fx.resident({ flatId: f.flats[0]! });
    const categoryId = (
      await admin.query(
        `select id from app.ticket_categories where status = 'ACTIVE' order by sort limit 1`,
      )
    ).rows[0].id as string;
    ticketId = (
      await support.residentCreate(A, 'qa', {
        categoryId,
        subject: `QA assign ${fx.s}`,
        description: 'Assignment fixture ticket.',
      })
    ).id;

    const mk = async (
      key: keyof typeof adm,
      scope: 'GLOBAL' | 'CLUSTERS',
      cluster: string | null,
      grants: [string, string][],
    ) => {
      const id = adm[key];
      await fx.q(
        `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`,
        [id, `qa-${key}-${fx.s.toLowerCase()}@example.test`],
      );
      fx.authUsers.push(id);
      await fx.q(
        `insert into app.admin_profiles (id, email, full_name, status, scope_type) values ($1, $2, $3, 'ACTIVE', $4)`,
        [
          id,
          `qa-${key}-${fx.s.toLowerCase()}@example.test`,
          `QA Admin ${key.toUpperCase()} ${fx.s}`,
          scope,
        ],
      );
      for (const [m, a] of grants)
        await fx.q(
          `insert into app.admin_extra_grants (admin_id, module_key, action_key) values ($1, $2, $3)`,
          [id, m, a],
        );
      if (cluster)
        await fx.q(`insert into app.admin_cluster_scopes (admin_id, cluster_id) values ($1, $2)`, [
          id,
          cluster,
        ]);
    };
    await mk('x', 'CLUSTERS', f.north, [
      ['support', 'view'],
      ['support', 'edit'],
    ]);
    await mk('y', 'CLUSTERS', f.south, [
      ['support', 'view'],
      ['support', 'edit'],
    ]);
    await mk('z', 'CLUSTERS', f.north, [['support', 'view']]);
    await mk('g', 'GLOBAL', null, [['support', 'edit']]);
    fx.extra.push({ table: 'admin_profiles', ids: Object.values(adm) });
  }, 180_000);

  afterAll(async () => {
    await fx?.cleanup();
    await db?.destroy();
    await admin?.end();
  }, 180_000);

  // ------------------------------------------------------------------ ADM-03

  describe('cluster membership', () => {
    let east: string;
    let gamma: string;
    let delta: string;

    beforeAll(async () => {
      east = (await loc.createCluster(root, 'qa', { name: `QA East ${fx.s}`, code: `QE${fx.s}` }))
        .id;
      fx.clusters.push(east);
      gamma = (
        await loc.createCommunity(root, 'qa', {
          cityId: f.cityId,
          name: `QA Gamma ${fx.s}`,
          code: `QG${fx.s}`,
        })
      ).id;
      delta = (
        await loc.createCommunity(root, 'qa', {
          cityId: f.cityId,
          name: `QA Delta ${fx.s}`,
          code: `QD${fx.s}`,
          clusterId: f.south,
        })
      ).id;
      const tower = (await loc.createTower(root, 'qa', { communityId: gamma, name: 'G1' })).id;
      await loc.createFlat(root, 'qa', { towerId: tower, flatNumber: '1' });
      await loc.createFlat(root, 'qa', { towerId: tower, flatNumber: '2' });
    });

    it('lists unassigned communities for global scope only', async () => {
      const names = async (a: ReturnType<typeof actor>) =>
        (await loc.listCommunities(a, { limit: 100, q: fx.s, unassigned: true })).items.map(
          (c) => c.name,
        );
      expect(await names(root)).toEqual([`QA Gamma ${fx.s}`]);
      expect(await names(north())).toEqual([]);
    });

    it('a scoped admin cannot pull in an unassigned or other-cluster community (404, nothing changes)', async () => {
      const both = actor({
        id: randomUUID(),
        grants: all,
        scope: { type: 'CLUSTERS', clusterIds: [f.north, east] },
      });
      const err = await loc
        .assignCommunitiesToCluster(both, 'qa', east, {
          communityIds: [f.communityId, gamma, delta],
          reason: 'QA rebalance',
        })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('NOT_FOUND');
      expect((err as AppError).fields?.map((x) => x.path).sort()).toEqual([
        'communityIds.1',
        'communityIds.2',
      ]);
      const { rows } = await admin.query(
        `select count(*)::int n from app.cluster_community_memberships where cluster_id = $1`,
        [east],
      );
      expect(rows[0].n).toBe(0);
      // Target out of scope: 404 as well.
      await expectCode(
        loc.assignCommunitiesToCluster(north(), 'qa', east, {
          communityIds: [f.communityId],
          reason: 'QA rebalance',
        }),
        'NOT_FOUND',
      );
    });

    it('assigns and moves in one transaction, keeps history, skips members', async () => {
      const r = await loc.assignCommunitiesToCluster(root, 'qa', east, {
        communityIds: [gamma, delta, gamma],
        reason: 'QA east launch',
      });
      expect(r).toMatchObject({ clusterId: east, assigned: 1, moved: 1, skipped: 0 });
      expect(r.results.find((x) => x.communityId === delta)).toMatchObject({
        outcome: 'MOVED',
        fromClusterId: f.south,
      });
      expect(r.results.find((x) => x.communityId === gamma)).toMatchObject({
        outcome: 'ASSIGNED',
        fromClusterId: null,
      });

      const again = await loc.assignCommunitiesToCluster(root, 'qa', east, {
        communityIds: [gamma],
        reason: 'QA east launch',
      });
      expect(again).toMatchObject({ assigned: 0, moved: 0, skipped: 1 });

      const members = await loc.clusterCommunities(root, east);
      expect(members.map((m) => m.name).sort()).toEqual([`QA Delta ${fx.s}`, `QA Gamma ${fx.s}`]);
      expect(members.find((m) => m.communityId === gamma)).toMatchObject({
        towerCount: 1,
        flatCount: 2,
        reason: 'QA east launch',
      });

      const history = await loc.membershipHistory(root, delta);
      expect(history.map((h) => [h.clusterId, h.effectiveTo === null])).toEqual([
        [east, true],
        [f.south, false],
      ]);
      const { rows } = await admin.query(
        `select count(*)::int n from app.audit_events where action = 'community.cluster_assigned' and target_id = any($1::text[])`,
        [[gamma, delta]],
      );
      expect(rows[0].n).toBe(2);
    });

    it('cluster members are 404 outside scope', async () => {
      await expectCode(loc.clusterCommunities(north(), east), 'NOT_FOUND');
      expect((await loc.clusterCommunities(north(), f.north)).map((m) => m.communityId)).toContain(
        f.communityId,
      );
    });
  });

  // ------------------------------------------------------------------ ADM-13

  describe('ticket assignment and context', () => {
    it('eligible assignees hold support:edit and cover the ticket cluster', async () => {
      const ids = (await support.assignees(north(), ticketId)).map((a) => a.id);
      expect(ids).toEqual(expect.arrayContaining([adm.x, adm.g]));
      expect(ids).not.toContain(adm.y);
      expect(ids).not.toContain(adm.z);
      await expectCode(support.assignees(south(), ticketId), 'NOT_FOUND');
    });

    it('assigns, reassigns, notes it internally, emails the owner and audits', async () => {
      await expectCode(support.assign(north(), 'qa', ticketId, adm.y), 'BUSINESS_RULE_VIOLATION');
      await expectCode(support.assign(north(), 'qa', ticketId, adm.z), 'BUSINESS_RULE_VIOLATION');
      await expectCode(support.assign(south(), 'qa', ticketId, adm.x), 'NOT_FOUND');

      const d1 = await support.assign(north(), 'qa', ticketId, adm.x);
      expect(d1).toMatchObject({ ownerAdminId: adm.x, status: 'ASSIGNED' });
      expect(
        d1.updates.some((u) => u.visibility === 'INTERNAL' && u.body.startsWith('Assigned to')),
      ).toBe(true);

      const d2 = await support.assign(north(), 'qa', ticketId, adm.g);
      expect(d2.ownerAdminId).toBe(adm.g);
      expect(
        d2.updates.some(
          (u) =>
            u.visibility === 'INTERNAL' && u.body.startsWith(`Reassigned from QA Admin X ${fx.s}`),
        ),
      ).toBe(true);
      await expectCode(support.assign(north(), 'qa', ticketId, adm.g), 'BUSINESS_RULE_VIOLATION');

      const outbox = await admin.query(
        `select recipient from app.notification_outbox where event_type = 'ticket.assigned' and dedupe_key like $1 order by created_at`,
        [`ticket_assigned:${ticketId}:%`],
      );
      expect(outbox.rows.map((r) => r.recipient)).toEqual([
        `qa-x-${fx.s.toLowerCase()}@example.test`,
        `qa-g-${fx.s.toLowerCase()}@example.test`,
      ]);
      const audit = await admin.query(
        `select action, before_data, after_data from app.audit_events where target_id = $1 and action like 'ticket.%assigned' order by occurred_at`,
        [ticketId],
      );
      expect(audit.rows.map((r) => r.action)).toEqual(['ticket.assigned', 'ticket.reassigned']);
      expect(audit.rows[1].before_data).toMatchObject({ owner: adm.x });
      expect(audit.rows[1].after_data).toMatchObject({ owner: adm.g });
      // Clean the outbox rows this test queued (they would otherwise be emailed by a running worker).
      await admin.query(`delete from app.notification_outbox where dedupe_key like $1`, [
        `ticket_assigned:${ticketId}:%`,
      ]);
    });

    it('detail carries the linked context, scoped', async () => {
      const d = await support.adminDetail(north(), ticketId);
      expect(d.context?.flat).toMatchObject({
        flatId: f.flats[0],
        communityId: f.communityId,
        communityName: `QA Alpha ${fx.s}`,
      });
      expect(d.context).toMatchObject({
        bookings: [],
        payments: [],
        recentVisits: [],
        upcomingVisits: [],
      });
      await expectCode(support.adminDetail(south(), ticketId), 'NOT_FOUND');
    });
  });

  // ------------------------------------------------------------------ ADM-05

  describe('resident edit and bookings', () => {
    it('edits name and email with optimistic concurrency, audited; out of scope is 404', async () => {
      const svc = new ResidentAdminService(db, fakeDeps({}).storage);
      const before = await svc.detail(north(), A.id);
      const after = await svc.update(north(), 'qa', A.id, {
        fullName: `QA Renamed ${fx.s}`,
        email: 'qa.renamed@example.test',
        version: before.version,
      });
      expect(after).toMatchObject({
        fullName: `QA Renamed ${fx.s}`,
        email: 'qa.renamed@example.test',
        phone: A.phone,
        version: before.version + 1,
      });
      await expectCode(
        svc.update(north(), 'qa', A.id, { fullName: 'QA Stale', version: before.version }),
        'VERSION_CONFLICT',
      );
      await expectCode(
        svc.update(south(), 'qa', A.id, { fullName: 'QA Hijack', version: after.version }),
        'NOT_FOUND',
      );
      const audit = await admin.query(
        `select before_data, after_data from app.audit_events where target_id = $1 and action = 'resident.updated'`,
        [A.id],
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0].after_data).toMatchObject({ email: 'qa.renamed@example.test' });
    });

    it('lists bookings (none yet) and hides other clusters’ residents', async () => {
      const svc = new ResidentAdminService(db, fakeDeps({}).storage);
      expect(await svc.bookings(north(), A.id, { limit: 10 })).toEqual({
        items: [],
        nextCursor: null,
      });
      await expectCode(svc.bookings(south(), A.id, { limit: 10 }), 'NOT_FOUND');
    });
  });

  // ------------------------------------------------------------------ ADM-04

  it('import rows filter by status and page by offset or keyset', async () => {
    const mig = new MigrationService(db);
    const communityId = (
      await loc.createCommunity(root, 'qa', {
        cityId: f.cityId,
        name: `QA Import ${fx.s}`,
        code: `QI${fx.s}`,
        clusterId: f.north,
      })
    ).id;
    await new CatalogueService(db).createCategory(root, 'qa', communityId, {
      code: 'STD',
      label: 'Standard',
    });
    const batch = await mig.submitGrid(root, 'qa', communityId, [
      { tower: 'A', flatNumber: '101', category: 'STD' },
      { tower: 'A', flatNumber: '102', category: 'STD' },
      { tower: 'A', flatNumber: '103', category: 'NOPE' },
      { tower: 'A', flatNumber: '104', category: 'STD' },
      { tower: 'A', flatNumber: '105', category: 'NOPE' },
    ]);
    const all = await mig.rows(root, batch.id, { status: 'all', onlyProblems: true, limit: 2 });
    expect(all.total).toBe(5);
    expect(all.items.map((r) => r.rowNumber)).toEqual([2, 3]);
    const next = await mig.rows(root, batch.id, {
      status: 'all',
      onlyProblems: true,
      limit: 2,
      afterRow: all.nextAfterRow!,
    });
    expect(next.items.map((r) => r.rowNumber)).toEqual([4, 5]);
    const jump = await mig.rows(root, batch.id, {
      status: 'all',
      onlyProblems: true,
      limit: 2,
      offset: 4,
    });
    expect(jump).toMatchObject({ total: 5, nextAfterRow: null });
    expect(jump.items.map((r) => r.rowNumber)).toEqual([6]);
    const errors = await mig.rows(root, batch.id, {
      status: 'error',
      onlyProblems: true,
      limit: 100,
    });
    expect(errors.items.map((r) => r.rowNumber)).toEqual([4, 6]);
    expect(
      (await mig.rows(root, batch.id, { status: 'ok', onlyProblems: true, limit: 100 })).total,
    ).toBe(3);
    // Default (no status) keeps the old behaviour: problems only.
    expect((await mig.rows(root, batch.id, { onlyProblems: true, limit: 100 })).total).toBe(2);
    await expectCode(
      mig.rows(south(), batch.id, { status: 'all', onlyProblems: true, limit: 10 }),
      'NOT_FOUND',
    );
  });

  // ------------------------------------------------------------------ ADM-12

  it('feedback list is scoped and filterable', async () => {
    const att = new AttendanceService(db, 'qa-salt-0123456789');
    const page = await att.feedbackList(north(), {
      limit: 10,
      communityId: f.communityId,
      minRating: 1,
      maxRating: 5,
    });
    expect(page.items).toEqual([]);
    await expectCode(
      att.feedbackList(north(), { limit: 10, communityId: f.southCommunityId }),
      'NOT_FOUND',
    );
  });

  // ------------------------------------------------------------------ ADM-01

  it('dashboard loads every granted section from real tables, scoped', async () => {
    const d = await buildDashboard(db, north());
    for (const [name, sec] of Object.entries(d.sections))
      expect(`${name}:${sec?.status}`).toBe(`${name}:ok`);
    expect(Object.keys(d.sections).sort()).toEqual([
      'activeSubscriptionsByService',
      'paymentsDaily',
      'queues',
      'subscriptionsDaily',
      'ticketsByCategory',
      'visitsDaily',
      'workersByReadiness',
    ]);
    const open = d.sections.queues!.data!.items.find((q) => q.key === 'tickets_open')!;
    expect(open.count).toBeGreaterThanOrEqual(1);
    expect(d.sections.visitsDaily!.data!.points).toHaveLength(30);

    const sup = await buildDashboard(db, root);
    expect(Object.values(sup.sections).every((s) => s?.status === 'ok')).toBe(true);
    expect(sup.sections.queues!.data!.items.map((q) => q.key)).toContain('payroll_approval');
  });
});
