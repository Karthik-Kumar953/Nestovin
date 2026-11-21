import { Router } from 'express';
import { sql } from 'kysely';
import type { AppDeps } from '../../http/context';
import { adminOf } from '../../http/context';
import { can, toDbClaims, type AdminActor } from '../../auth/permissions';
import { withTx, type Tx } from '../../db/database';
import { businessToday } from '../../lib/dates';
import { authorize } from '../../http/middleware';
import { buildDashboard } from './dashboard';

export interface OverviewItem {
  key: string;
  label: string;
  count: number;
  to: string;
}

/**
 * ADM-01: pending work queues. Each count is included only when the admin has
 * the module, and is computed under the admin's claims, so RLS and cluster scope
 * apply. A cluster-scoped admin never sees global numbers.
 */
export async function overview(db: AppDeps['db'], actor: AdminActor): Promise<OverviewItem[]> {
  return withTx(db, toDbClaims(actor), async (trx: Tx) => {
    const today = businessToday();
    const week = businessToday(new Date(Date.now() + 7 * 86_400_000));
    const n = async (q: { executeTakeFirstOrThrow: () => Promise<{ n: string | number | bigint }> }) => Number((await q.executeTakeFirstOrThrow()).n);
    const count = sql<string>`count(*)`.as('n');
    const items: OverviewItem[] = [];
    const add = async (ok: boolean, key: string, label: string, to: string, q: () => Promise<number>) => {
      if (ok) items.push({ key, label, to, count: await q() });
    };
    await add(can(actor, 'residents', 'view'), 'verifications', 'Residence verifications waiting', '/residents/verifications', () =>
      n(
        trx
          .selectFrom('app.residence_verification_requests as v')
          .innerJoin('app.documents as d', 'd.id', 'v.document_id')
          .select(count)
          .where('v.decision', '=', 'PENDING')
          .where('d.status', '=', 'UPLOADED'),
      ),
    );
    await add(can(actor, 'family_requests', 'view'), 'family', 'Family requests waiting', '/residents/family-requests', () =>
      n(trx.selectFrom('app.family_access_requests').select(count).where('status', '=', 'PENDING')),
    );
    await add(can(actor, 'support', 'view'), 'tickets', 'Open support tickets', '/support/tickets', () =>
      n(trx.selectFrom('app.support_tickets').select(count).where('status', 'not in', ['RESOLVED', 'CLOSED'])),
    );
    await add(can(actor, 'support', 'view'), 'enquiries', 'New website enquiries', '/support/enquiries', () =>
      n(trx.selectFrom('app.website_enquiries').select(count).where('status', '=', 'NEW')),
    );
    await add(can(actor, 'demand_payments', 'view'), 'payment_exceptions', 'Payments needing review', '/demand/payments', () =>
      n(trx.selectFrom('app.payment_exceptions').select(count).where('status', '=', 'OPEN')),
    );
    await add(can(actor, 'allocation', 'view'), 'unstaffed', 'Paid services without a worker', '/allocation', () =>
      n(
        trx
          .selectFrom('app.subscription_components as c')
          .innerJoin('app.subscriptions as s', 's.id', 'c.subscription_id')
          .leftJoin('app.standing_assignments as a', (j) => j.onRef('a.subscription_component_id', '=', 'c.id').on('a.status', '=', 'ACTIVE'))
          .select(count)
          .where('s.status', 'in', ['PENDING_ACTIVATION', 'ACTIVE'])
          .where('s.period_end', '>=', today)
          .where('a.id', 'is', null),
      ),
    );
    await add(can(actor, 'allocation', 'view'), 'gaps', 'Visits without a worker (next 7 days)', '/allocation/visits', () =>
      n(
        trx
          .selectFrom('app.service_occurrences as o')
          .leftJoin('app.occurrence_assignments as a', (j) => j.onRef('a.occurrence_id', '=', 'o.id').on('a.status', '=', 'ACTIVE'))
          .select(count)
          .where('o.scheduled_date', '>=', today)
          .where('o.scheduled_date', '<=', week)
          .where('o.status', '=', 'SCHEDULED')
          .where('a.id', 'is', null),
      ),
    );
    await add(can(actor, 'employees', 'view'), 'leave', 'Leave requests waiting', '/workforce/leave', () =>
      n(trx.selectFrom('app.leave_requests').select(count).where('status', '=', 'PENDING')),
    );
    await add(can(actor, 'employees', 'view'), 'applicants', 'New applicants', '/workforce/applicants', () =>
      n(trx.selectFrom('app.applicants').select(count).where('status', '=', 'NEW')),
    );
    await add(can(actor, 'attendance', 'view'), 'flags', 'Check-ins to review', '/attendance', () =>
      n(trx.selectFrom('app.attendance_events').select(count).where('review_status', '=', 'OPEN')),
    );
    await add(can(actor, 'attendance', 'view'), 'corrections', 'Attendance corrections waiting', '/attendance/corrections', () =>
      n(trx.selectFrom('app.attendance_corrections').select(count).where('status', '=', 'PENDING')),
    );
    await add(can(actor, 'finance_payroll', 'approve'), 'payroll_review', 'Payroll waiting for approval', '/finance/payroll', () =>
      n(trx.selectFrom('app.payroll_runs').select(count).where('status', '=', 'IN_REVIEW')),
    );
    return items;
  });
}

export function overviewRoutes(deps: AppDeps): Router {
  const r = Router();
  // ADM-01 home dashboard: queues, 30-day series and breakdowns; each section gated by its module grant.
  r.get('/overview/dashboard', authorize('overview', 'view'), async (req, res) => {
    res.json(await buildDashboard(deps.db, adminOf(req), deps.logger));
  });
  // Every admin may call it; each count is gated by its own module grant.
  r.get('/overview', async (req, res) => {
    res.json({ items: await overview(deps.db, adminOf(req)) });
  });
  return r;
}
