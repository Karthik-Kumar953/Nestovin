import { describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  adminDashboardSchema,
  adminUpdateResidentSchema,
  assignClusterCommunitiesSchema,
  communityListQuerySchema,
  expansionVoteQuerySchema,
  feedbackListQuerySchema,
  importRowsQuerySchema,
  type GrantKey,
} from '@nestovin/contracts';
import { createApp } from '../../src/app';
import { AppError } from '../../src/lib/errors';
import { PayrollService, assertNotPreparer } from '../../src/modules/payroll/service';
import {
  buildDashboard,
  daysBetween,
  fillDays,
  visibleQueues,
} from '../../src/modules/overview/dashboard';
import { actor, fakeDeps } from '../helpers/fake-deps';
import { scriptedDb, type Statement } from '../helpers/scripted-db';

/*
 * Admin Portal redesign backend (ADM-01/03/04/05/12/13/14). No database: the
 * scripted driver records statements and answers each query.
 */

const RUN_ID = '0d4b8c1e-1f7e-4a4e-9a51-3f1c2b7d9e01';
const PREPARER = '20000000-0000-4000-8000-000000000001';
const SUBMITTER = '20000000-0000-4000-8000-000000000002';
const APPROVER = '20000000-0000-4000-8000-000000000003';

describe('ADM-14 payroll separation of duties', () => {
  it('blocks the preparer and the submitter, allows anyone else', () => {
    const code = (fn: () => void) => {
      try {
        fn();
        return null;
      } catch (e) {
        return e instanceof AppError ? `${e.code}:${e.status}` : 'other';
      }
    };
    expect(code(() => assertNotPreparer(PREPARER, PREPARER, SUBMITTER))).toBe(
      'SAME_PREPARER_APPROVER:422',
    );
    expect(code(() => assertNotPreparer(SUBMITTER, PREPARER, SUBMITTER))).toBe(
      'SAME_PREPARER_APPROVER:422',
    );
    expect(code(() => assertNotPreparer(APPROVER, PREPARER, SUBMITTER))).toBeNull();
    // Legacy rows without a recorded preparer/submitter do not block anyone.
    expect(code(() => assertNotPreparer(APPROVER, null, null))).toBeNull();
  });

  /** A run IN_REVIEW prepared by PREPARER and submitted by SUBMITTER. */
  function payrollDb() {
    return scriptedDb((q: Statement) => {
      if (q.sql.includes('from "app"."payroll_runs"') && q.sql.includes('for update')) {
        return [
          { id: RUN_ID, status: 'IN_REVIEW', prepared_by: PREPARER, period_id: 'p', version: 1 },
        ];
      }
      if (q.sql.includes('from "app"."audit_events"')) return [{ actor_id: SUBMITTER }];
      return undefined;
    });
  }

  it.each([
    ['the preparer', PREPARER],
    ['the submitter', SUBMITTER],
  ])('%s cannot approve, even as Super Admin, and nothing is written', async (_who, id) => {
    const { db, log } = payrollDb();
    const svc = new PayrollService(db);
    const root = actor({ id, isSuperAdmin: true, scope: { type: 'GLOBAL' } });
    await expect(svc.approve(root, 'qa', RUN_ID)).rejects.toSatisfy(
      (e: unknown) => e instanceof AppError && e.code === 'SAME_PREPARER_APPROVER',
    );
    expect(log.some((s) => s.sql.startsWith('update "app"."payroll_runs"'))).toBe(false);
    expect(log.some((s) => s.sql === 'rollback')).toBe(true);
  });

  it('another admin passes the check and the approval is written', async () => {
    const { db, log } = payrollDb();
    const svc = new PayrollService(db);
    await svc
      .approve(actor({ id: APPROVER, isSuperAdmin: true, scope: { type: 'GLOBAL' } }), 'qa', RUN_ID)
      .catch(() => undefined);
    expect(
      log.some(
        (s) => s.sql.startsWith('update "app"."payroll_runs"') && s.params.includes(APPROVER),
      ),
    ).toBe(true);
  });

  it('the HTTP route answers 422 SAME_PREPARER_APPROVER', async () => {
    const { db } = payrollDb();
    const deps = fakeDeps({
      [PREPARER]: { status: 'ACTIVE', actor: actor({ id: PREPARER, isSuperAdmin: true }) },
    });
    const app = createApp({ ...deps, db });
    const res = await request(app)
      .post(`/v1/admin/payroll-runs/${RUN_ID}/approve`)
      .set('Authorization', `Bearer token:aal2:${PREPARER}`);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SAME_PREPARER_APPROVER');
  });
});

describe('ADM-01 dashboard', () => {
  it('series days are a closed 30-day window, gaps filled with zeros', () => {
    const days = daysBetween('2026-10-23', '2026-11-21');
    expect(days).toHaveLength(30);
    expect(days[0]).toBe('2026-10-23');
    expect(days.at(-1)).toBe('2026-11-21');
    const filled = fillDays(days, [{ date: '2026-11-01', count: 4 }], (date) => ({
      date,
      count: 0,
    }));
    expect(filled).toHaveLength(30);
    expect(filled.find((p) => p.date === '2026-11-01')!.count).toBe(4);
    expect(filled.filter((p) => p.count === 0)).toHaveLength(29);
  });

  it('queues follow the grants; payroll approval also needs all-cluster scope', () => {
    const keys = (grants: GrantKey[], global = true) =>
      visibleQueues(
        actor({
          grants,
          scope: global ? { type: 'GLOBAL' } : { type: 'CLUSTERS', clusterIds: [] },
        }),
      ).map((q) => q.key);
    expect(keys([])).toEqual([]);
    expect(keys(['support:view'])).toEqual([
      'tickets_open',
      'tickets_overdue',
      'tickets_escalated',
    ]);
    expect(keys(['finance_payroll:view'])).toEqual([]);
    expect(keys(['finance_payroll:approve'])).toEqual(['payroll_approval']);
    expect(keys(['finance_payroll:approve'], false)).toEqual([]);
    expect(keys(['community_migration:view'])).toEqual([]);
    expect(keys(['community_migration:approve'])).toEqual(['import_batches']);
    expect(visibleQueues(actor({ isSuperAdmin: true })).length).toBe(14);
  });

  it('omits sections without the grant; a failing section is unavailable and the rest still load', async () => {
    const { db, log } = scriptedDb((q) => {
      if (q.sql.includes('"app"."payment_transactions"')) throw new Error('boom');
      if (q.sql.includes('from "app"."support_tickets"') && q.sql.startsWith('select count(*)'))
        return [{ n: '7' }];
      if (q.sql.startsWith('select count(*)')) return [{ n: '2' }];
      return undefined;
    });
    const a = actor({
      grants: ['support:view', 'demand_payments:view'],
      scope: { type: 'CLUSTERS', clusterIds: ['30000000-0000-4000-8000-000000000001'] },
    });
    const d = await buildDashboard(db, a);
    expect(adminDashboardSchema.safeParse(d).success).toBe(true);
    expect(Object.keys(d.sections).sort()).toEqual([
      'activeSubscriptionsByService',
      'paymentsDaily',
      'queues',
      'subscriptionsDaily',
      'ticketsByCategory',
    ]);
    expect(d.sections.paymentsDaily).toEqual({ status: 'unavailable', data: null });
    expect(d.sections.subscriptionsDaily?.status).toBe('ok');
    expect(d.sections.subscriptionsDaily?.data?.points).toHaveLength(30);
    const queues = d.sections.queues!.data!.items;
    expect(queues.find((q) => q.key === 'tickets_open')).toMatchObject({ status: 'ok', count: 7 });
    expect(queues.find((q) => q.key === 'payments_review')).toMatchObject({
      status: 'ok',
      count: 2,
    });
    // The failure was contained by a savepoint and the transaction still committed.
    expect(log.some((s) => s.sql.startsWith('rollback to savepoint'))).toBe(true);
    expect(log.at(-1)!.sql).toBe('commit');
    expect(d.scope).toEqual({
      type: 'CLUSTERS',
      clusterIds: ['30000000-0000-4000-8000-000000000001'],
    });
  });

  it('the route needs overview:view', async () => {
    const id = '20000000-0000-4000-8000-000000000009';
    const app = createApp(
      fakeDeps({ [id]: { status: 'ACTIVE', actor: actor({ id, grants: ['support:view'] }) } }),
    );
    const res = await request(app)
      .get('/v1/admin/overview/dashboard')
      .set('Authorization', `Bearer token:aal2:${id}`);
    expect(res.status).toBe(403);
  });
});

describe('request contracts', () => {
  it('resident edit: name/email only, phone cannot be changed, needs a field and a version', () => {
    expect(adminUpdateResidentSchema.safeParse({ fullName: 'Asha Rao', version: 3 }).success).toBe(
      true,
    );
    expect(
      adminUpdateResidentSchema.safeParse({ email: 'A@Example.com', version: 3 }).data?.email,
    ).toBe('a@example.com');
    expect(adminUpdateResidentSchema.safeParse({ email: null, version: 3 }).success).toBe(true);
    expect(
      adminUpdateResidentSchema.safeParse({ phone: '+919999999999', fullName: 'Asha', version: 3 })
        .success,
    ).toBe(false);
    expect(adminUpdateResidentSchema.safeParse({ version: 3 }).success).toBe(false);
    expect(adminUpdateResidentSchema.safeParse({ fullName: 'Asha Rao' }).success).toBe(false);
  });

  it('bulk cluster assignment: 1..200 ids and a reason', () => {
    const id = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
    expect(
      assignClusterCommunitiesSchema.safeParse({ communityIds: [id], reason: 'Rebalance' }).success,
    ).toBe(true);
    expect(
      assignClusterCommunitiesSchema.safeParse({ communityIds: [], reason: 'Rebalance' }).success,
    ).toBe(false);
    expect(
      assignClusterCommunitiesSchema.safeParse({
        communityIds: Array(201).fill(id),
        reason: 'Rebalance',
      }).success,
    ).toBe(false);
    expect(
      assignClusterCommunitiesSchema.safeParse({ communityIds: [id], reason: 'no' }).success,
    ).toBe(false);
  });

  it('community list accepts unassigned and q', () => {
    expect(communityListQuerySchema.parse({ unassigned: 'true', q: ' gre ' })).toMatchObject({
      unassigned: true,
      q: 'gre',
      limit: 25,
    });
    expect(communityListQuerySchema.safeParse({ unassigned: 'yes' }).success).toBe(false);
  });

  it('import rows: status filter, offset and keyset paging', () => {
    expect(importRowsQuerySchema.parse({})).toMatchObject({ onlyProblems: true, limit: 100 });
    expect(
      importRowsQuerySchema.parse({ status: 'error', offset: '19900', limit: '100' }),
    ).toMatchObject({ status: 'error', offset: 19900, limit: 100 });
    expect(importRowsQuerySchema.safeParse({ status: 'bad' }).success).toBe(false);
    expect(importRowsQuerySchema.safeParse({ offset: '20001' }).success).toBe(false);
    expect(importRowsQuerySchema.safeParse({ limit: '501' }).success).toBe(false);
  });

  it('feedback and expansion-vote filters', () => {
    expect(
      feedbackListQuerySchema.parse({ minRating: '1', maxRating: '2', withComment: 'true' }),
    ).toMatchObject({ minRating: 1, maxRating: 2, withComment: true });
    expect(feedbackListQuerySchema.safeParse({ minRating: '6' }).success).toBe(false);
    expect(expansionVoteQuerySchema.parse({})).toMatchObject({ sort: 'votes', limit: 500 });
    expect(
      expansionVoteQuerySchema.parse({ level: 'CITY', city: 'Pune', sort: 'recent' }),
    ).toMatchObject({ level: 'CITY', city: 'Pune', sort: 'recent' });
    expect(expansionVoteQuerySchema.safeParse({ sort: 'random' }).success).toBe(false);
  });
});
