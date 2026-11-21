import { sql } from 'kysely';
import type { AdminDashboard, DashboardQueue, ModuleKey, Action } from '@nestovin/contracts';
import type { Database, Tx } from '../../db/database';
import { withTx } from '../../db/database';
import {
  can,
  hasGlobalScope,
  scopeClusterIds,
  toDbClaims,
  type AdminActor,
} from '../../auth/permissions';
import { businessToday } from '../../lib/dates';
import type { Logger } from '../../lib/logger';

/*
 * ADM-01 admin home dashboard. Rules:
 *  - Every query runs under the admin's claims, so RLS limits Tier A tables to the
 *    admin's clusters. Tier B tables (import batches) are filtered explicitly.
 *  - A section (and each queue) is included only when the admin holds the grant it
 *    needs; sections the admin lacks are omitted, not returned empty.
 *  - Each section runs inside its own savepoint with a short statement timeout,
 *    so one failing or slow query marks that section 'unavailable' and the rest
 *    of the dashboard still loads.
 *  - Calendar days are India time (Asia/Kolkata); the series cover 30 days.
 */

const TZ = 'Asia/Kolkata';
const DAYS = 30;
/** Per-statement limit inside the dashboard transaction (the request default is 15s). */
const SECTION_TIMEOUT = '4s';

type Section<T> = { status: 'ok' | 'unavailable'; data: T | null };

const shift = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

/** Every calendar day from `from` to `to` inclusive. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = shift(d, 1)) out.push(d);
  return out;
}

/** Fills missing days with zeros so every series has exactly one point per day. */
export function fillDays<T extends { date: string }>(
  days: string[],
  rows: T[],
  empty: (date: string) => T,
): T[] {
  const byDay = new Map(rows.map((r) => [r.date, r]));
  return days.map((d) => byDay.get(d) ?? empty(d));
}

let savepointSeq = 0;

/**
 * Runs `fn` inside a savepoint. On error the savepoint is rolled back (the outer
 * transaction stays usable) and the result is `unavailable`.
 */
async function guarded<T>(
  trx: Tx,
  name: string,
  logger: Logger | undefined,
  fn: () => Promise<T>,
): Promise<Section<T>> {
  const sp = sql.raw(`dash_${++savepointSeq % 1_000_000}`);
  await sql`savepoint ${sp}`.execute(trx);
  try {
    const data = await fn();
    await sql`release savepoint ${sp}`.execute(trx);
    return { status: 'ok', data };
  } catch (err) {
    logger?.warn({ err, section: name }, 'dashboard section unavailable');
    await sql`rollback to savepoint ${sp}`.execute(trx);
    return { status: 'unavailable', data: null };
  }
}

interface QueueDef {
  key: DashboardQueue['key'];
  label: string;
  module: ModuleKey;
  action: Action;
  to: string;
  /** Extra condition beyond the grant (e.g. global scope for payroll). */
  when?: (actor: AdminActor) => boolean;
  count: (trx: Tx, ctx: { today: string; week: string; actor: AdminActor }) => Promise<number>;
}

const n = async (q: { executeTakeFirstOrThrow: () => Promise<{ n: string | number | bigint }> }) =>
  Number((await q.executeTakeFirstOrThrow()).n);
const count = () => sql<string>`count(*)`.as('n');

/** The pending-work queues. Kept as data so the gating is easy to read and test. */
export const QUEUES: QueueDef[] = [
  {
    key: 'residence_verifications',
    label: 'Residence verifications waiting',
    module: 'residents',
    action: 'view',
    to: '/residents/verifications',
    count: (trx) =>
      n(
        trx
          .selectFrom('app.residence_verification_requests as v')
          .innerJoin('app.documents as d', 'd.id', 'v.document_id')
          .select(count())
          .where('v.decision', '=', 'PENDING')
          .where('d.status', '=', 'UPLOADED'),
      ),
  },
  {
    key: 'family_requests',
    label: 'Family requests waiting',
    module: 'family_requests',
    action: 'view',
    to: '/residents/family-requests',
    count: (trx) =>
      n(
        trx
          .selectFrom('app.family_access_requests')
          .select(count())
          .where('status', '=', 'PENDING'),
      ),
  },
  {
    key: 'change_requests',
    label: 'Residence change requests waiting',
    module: 'residents',
    action: 'view',
    to: '/residents/change-requests',
    count: (trx) =>
      n(
        trx
          .selectFrom('app.resident_change_requests')
          .select(count())
          .where('status', '=', 'PENDING'),
      ),
  },
  {
    key: 'import_batches',
    label: 'Imports waiting for approval',
    module: 'community_migration',
    action: 'approve',
    to: '/locations/communities',
    // Tier B table (no RLS): scope by the community's current cluster here.
    count: (trx, { actor }) => importBatchCount(trx, actor),
  },
  {
    key: 'tickets_open',
    label: 'Open support tickets',
    module: 'support',
    action: 'view',
    to: '/support/tickets',
    count: (trx) =>
      n(
        trx
          .selectFrom('app.support_tickets')
          .select(count())
          .where('status', 'not in', ['RESOLVED', 'CLOSED']),
      ),
  },
  {
    key: 'tickets_overdue',
    label: 'Tickets past their deadline',
    module: 'support',
    action: 'view',
    to: '/support/tickets',
    count: (trx) =>
      n(
        trx
          .selectFrom('app.support_tickets')
          .select(count())
          .where('status', 'not in', ['RESOLVED', 'CLOSED'])
          .where('next_escalation_at', '<', sql<Date>`now()`),
      ),
  },
  {
    key: 'tickets_escalated',
    label: 'Escalated tickets',
    module: 'support',
    action: 'view',
    to: '/support/tickets',
    count: (trx) =>
      n(
        trx
          .selectFrom('app.support_tickets')
          .select(count())
          .where('status', 'not in', ['RESOLVED', 'CLOSED'])
          .where('escalation_level', '!=', 'NONE'),
      ),
  },
  {
    key: 'visits_unassigned',
    label: 'Visits without a worker (next 7 days)',
    module: 'allocation',
    action: 'view',
    to: '/allocation/visits',
    count: (trx, { today, week }) =>
      n(
        trx
          .selectFrom('app.service_occurrences as o')
          .leftJoin('app.occurrence_assignments as a', (j) =>
            j.onRef('a.occurrence_id', '=', 'o.id').on('a.status', '=', 'ACTIVE'),
          )
          .select(count())
          .where('o.scheduled_date', '>=', today)
          .where('o.scheduled_date', '<=', week)
          .where('o.status', 'in', ['SCHEDULED', 'ASSIGNED'])
          .where('a.id', 'is', null),
      ),
  },
  {
    key: 'payments_review',
    label: 'Payments needing review',
    module: 'demand_payments',
    action: 'view',
    to: '/demand/payments',
    count: (trx) =>
      n(
        trx
          .selectFrom('app.payment_orders')
          .select(count())
          .where('status', '=', 'REVIEW_REQUIRED'),
      ),
  },
  {
    key: 'payment_exceptions',
    label: 'Open payment exceptions',
    module: 'demand_payments',
    action: 'view',
    to: '/demand/payments',
    count: (trx) =>
      n(trx.selectFrom('app.payment_exceptions').select(count()).where('status', '=', 'OPEN')),
  },
  {
    key: 'leave_requests',
    label: 'Leave requests waiting',
    module: 'employees',
    action: 'view',
    to: '/workforce/leave',
    count: (trx) =>
      n(trx.selectFrom('app.leave_requests').select(count()).where('status', '=', 'PENDING')),
  },
  {
    key: 'attendance_flags',
    label: 'Check-ins to review',
    module: 'attendance',
    action: 'view',
    to: '/attendance',
    count: (trx) =>
      n(
        trx.selectFrom('app.attendance_events').select(count()).where('review_status', '=', 'OPEN'),
      ),
  },
  {
    key: 'attendance_corrections',
    label: 'Attendance corrections waiting',
    module: 'attendance',
    action: 'view',
    to: '/attendance/corrections',
    count: (trx) =>
      n(
        trx
          .selectFrom('app.attendance_corrections')
          .select(count())
          .where('status', '=', 'PENDING'),
      ),
  },
  {
    key: 'payroll_approval',
    label: 'Payroll waiting for approval',
    module: 'finance_payroll',
    action: 'approve',
    to: '/finance/payroll',
    // Payroll is one organisation-wide cycle and needs all-cluster scope to act on.
    when: hasGlobalScope,
    count: (trx) =>
      n(trx.selectFrom('app.payroll_runs').select(count()).where('status', '=', 'IN_REVIEW')),
  },
];

/** Queues the actor may see (grant + extra condition), in display order. */
export function visibleQueues(actor: AdminActor): QueueDef[] {
  return QUEUES.filter((q) => can(actor, q.module, q.action) && (q.when ? q.when(actor) : true));
}

/** VALIDATED batches (waiting for approval) whose community's current cluster is in scope. */
async function importBatchCount(trx: Tx, actor: AdminActor): Promise<number> {
  const clusters = scopeClusterIds(actor);
  if (clusters === 'all') {
    // Global admins also see batches for communities that have no cluster yet.
    return n(
      trx.selectFrom('app.import_batches').select(count()).where('status', '=', 'VALIDATED'),
    );
  }
  if (clusters.length === 0) return 0;
  return n(
    trx
      .selectFrom('app.import_batches as b')
      .innerJoin('app.cluster_community_memberships as m', (j) =>
        j.onRef('m.community_id', '=', 'b.community_id').on('m.effective_to', 'is', null),
      )
      .select(count())
      .where('b.status', '=', 'VALIDATED')
      .where('m.cluster_id', 'in', [...clusters]),
  );
}

/** Builds the whole dashboard for one admin. */
export async function buildDashboard(
  db: Database,
  actor: AdminActor,
  logger?: Logger,
): Promise<AdminDashboard> {
  const today = businessToday();
  const from = shift(today, -(DAYS - 1));
  const week = shift(today, 7);
  const days = daysBetween(from, today);
  const sections: AdminDashboard['sections'] = {};

  await withTx(db, toDbClaims(actor), async (trx) => {
    await sql`select set_config('statement_timeout', ${SECTION_TIMEOUT}, true)`.execute(trx);

    // ---------------------------------------------------------------- queues
    const queues = visibleQueues(actor);
    if (queues.length) {
      const items: DashboardQueue[] = [];
      for (const q of queues) {
        const r = await guarded(trx, `queue:${q.key}`, logger, () =>
          q.count(trx, { today, week, actor }),
        );
        items.push({
          key: q.key,
          label: q.label,
          module: q.module,
          to: q.to,
          status: r.status,
          count: r.data,
        });
      }
      sections.queues = {
        status: items.every((i) => i.status === 'unavailable') ? 'unavailable' : 'ok',
        data: { items },
      };
    }

    // ------------------------------------------------------------ time series
    if (can(actor, 'attendance', 'view') || can(actor, 'allocation', 'view')) {
      sections.visitsDaily = await guarded(trx, 'visitsDaily', logger, async () => {
        const rows = await trx
          .selectFrom('app.service_occurrences')
          .select([
            'scheduled_date',
            sql<string>`count(*) filter (where status <> 'CANCELLED')`.as('scheduled'),
            sql<string>`count(*) filter (where status = 'COMPLETED')`.as('completed'),
            sql<string>`count(*) filter (where status = 'NO_SHOW')`.as('no_show'),
          ])
          .where('scheduled_date', '>=', from)
          .where('scheduled_date', '<=', today)
          .groupBy('scheduled_date')
          .execute();
        const points = rows.map((r) => ({
          date: r.scheduled_date,
          scheduled: Number(r.scheduled),
          completed: Number(r.completed),
          noShow: Number(r.no_show),
        }));
        return {
          points: fillDays(days, points, (date) => ({
            date,
            scheduled: 0,
            completed: 0,
            noShow: 0,
          })),
        };
      });
    }

    if (can(actor, 'demand_payments', 'view')) {
      // Range bounds as instants: midnight India time at both ends.
      const start = sql<Date>`(${from}::date)::timestamp at time zone ${TZ}`;
      const end = sql<Date>`(${shift(today, 1)}::date)::timestamp at time zone ${TZ}`;
      const day = (col: string) =>
        sql<string>`to_char((${sql.ref(col)} at time zone ${TZ})::date, 'YYYY-MM-DD')`;

      sections.paymentsDaily = await guarded(trx, 'paymentsDaily', logger, async () => {
        const rows = await trx
          .selectFrom('app.payment_transactions')
          .select([
            day('verified_at').as('d'),
            sql<string>`coalesce(sum(amount_paise), 0)`.as('paise'),
            sql<string>`count(*)`.as('n'),
          ])
          .where('verified_at', '>=', start)
          .where('verified_at', '<', end)
          .groupBy(sql`1`)
          .execute();
        const points = rows.map((r) => ({
          date: r.d,
          capturedPaise: Number(r.paise),
          count: Number(r.n),
        }));
        return { points: fillDays(days, points, (date) => ({ date, capturedPaise: 0, count: 0 })) };
      });

      sections.subscriptionsDaily = await guarded(trx, 'subscriptionsDaily', logger, async () => {
        const rows = await trx
          .selectFrom('app.subscriptions')
          .select([day('created_at').as('d'), sql<string>`count(*)`.as('n')])
          .where('created_at', '>=', start)
          .where('created_at', '<', end)
          .groupBy(sql`1`)
          .execute();
        const points = rows.map((r) => ({ date: r.d, count: Number(r.n) }));
        return { points: fillDays(days, points, (date) => ({ date, count: 0 })) };
      });

      sections.activeSubscriptionsByService = await guarded(
        trx,
        'activeSubscriptionsByService',
        logger,
        async () => {
          const rows = await trx
            .selectFrom('app.subscription_components as c')
            .innerJoin('app.subscriptions as s', 's.id', 'c.subscription_id')
            .innerJoin('app.services as sv', 'sv.id', 'c.service_id')
            .select(['sv.id', 'sv.name', sql<string>`count(distinct s.id)`.as('n')])
            .where('s.status', '=', 'ACTIVE')
            .where('s.period_end', '>=', today)
            .groupBy(['sv.id', 'sv.name', 'sv.sort'])
            .orderBy('sv.sort')
            .execute();
          return {
            items: rows.map((r) => ({ serviceId: r.id, serviceName: r.name, count: Number(r.n) })),
          };
        },
      );
    }

    // -------------------------------------------------------------- breakdowns
    if (can(actor, 'employees', 'view')) {
      sections.workersByReadiness = await guarded(trx, 'workersByReadiness', logger, async () => {
        const rows = await trx
          .selectFrom('app.employees')
          .select(['readiness', sql<string>`count(*)`.as('n')])
          .where('status', '=', 'ACTIVE')
          .groupBy('readiness')
          .execute();
        const by = new Map(rows.map((r) => [r.readiness, Number(r.n)]));
        return {
          items: (['READY', 'NOT_READY'] as const).map((readiness) => ({
            readiness,
            count: by.get(readiness) ?? 0,
          })),
        };
      });
    }

    if (can(actor, 'support', 'view')) {
      sections.ticketsByCategory = await guarded(trx, 'ticketsByCategory', logger, async () => {
        const since = sql<Date>`(${from}::date)::timestamp at time zone ${TZ}`;
        const rows = await trx
          .selectFrom('app.support_tickets as t')
          .innerJoin('app.ticket_categories as c', 'c.id', 't.category_id')
          .select([
            'c.id',
            'c.name',
            sql<string>`count(*) filter (where t.status not in ('RESOLVED', 'CLOSED'))`.as('open'),
            sql<string>`count(*) filter (where t.created_at >= ${since})`.as('raised'),
          ])
          .where((eb) =>
            eb.or([
              eb('t.status', 'not in', ['RESOLVED', 'CLOSED']),
              eb('t.created_at', '>=', since),
            ]),
          )
          .groupBy(['c.id', 'c.name'])
          .execute();
        return {
          items: rows
            .map((r) => ({
              categoryId: r.id,
              categoryName: r.name,
              open: Number(r.open),
              raised: Number(r.raised),
            }))
            .sort(
              (a, b) =>
                b.open - a.open ||
                b.raised - a.raised ||
                a.categoryName.localeCompare(b.categoryName),
            ),
        };
      });
    }
  });

  return {
    generatedAt: new Date().toISOString(),
    timezone: TZ,
    range: { from, to: today },
    scope:
      actor.scope.type === 'GLOBAL'
        ? { type: 'GLOBAL', clusterIds: [] }
        : { type: 'CLUSTERS', clusterIds: [...actor.scope.clusterIds] },
    sections,
  };
}
