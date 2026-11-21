import { sql } from 'kysely';
import type { Database, Tx } from '../../db/database';
import { withTx } from '../../db/database';
import type { Logger } from '../../lib/logger';
import { SYSTEM_CLAIMS, setting } from '../bookings/payments';

export type EscalationLevel = 'NONE' | 'CLUSTER_ADMIN' | 'SUPER_ADMIN';
const TZ = 'Asia/Kolkata';

/** YYYY-MM-DD of an instant in India time. */
const istDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);

/**
 * Adds n working days (ADR-014: Sundays and listed holidays do not count),
 * keeping the clock time. A ticket raised on a non-working day starts counting
 * from the next working day.
 */
export function addWorkingDays(from: Date, n: number, holidays: ReadonlySet<string>): Date {
  const isWorking = (d: Date) => {
    const local = istDate(d);
    const weekday = new Date(`${local}T12:00:00Z`).getUTCDay(); // 0 = Sunday
    return weekday !== 0 && !holidays.has(local);
  };
  const out = new Date(from.getTime());
  let added = 0;
  while (added < n) {
    out.setTime(out.getTime() + 86_400_000);
    if (isWorking(out)) added++;
  }
  return out;
}

export async function holidaySet(trx: Tx | Database): Promise<Set<string>> {
  const rows = await trx
    .selectFrom('app.business_holidays')
    .select('holiday_date')
    .where('holiday_date', '>=', sql<string>`(now() at time zone 'Asia/Kolkata')::date - 7`)
    .execute();
  return new Set(rows.map((r) => r.holiday_date));
}

async function stepDays(trx: Tx): Promise<[number, number]> {
  const v = await setting<[number, number]>(trx, 'escalation_working_days', [2, 2]);
  return [Number(v[0] ?? 2), Number(v[1] ?? 2)];
}

/** Deadline for the first escalation, set when a ticket is created. */
export async function initialDeadline(trx: Tx, createdAt: Date): Promise<Date> {
  const [first] = await stepDays(trx);
  return addWorkingDays(createdAt, first, await holidaySet(trx));
}

/** Admins who should hear about an escalation: Cluster Admins (support:edit in scope) or Super Admins. */
async function recipients(trx: Tx, level: 'CLUSTER_ADMIN' | 'SUPER_ADMIN', clusterId: string | null): Promise<{ id: string; email: string }[]> {
  if (level === 'SUPER_ADMIN') {
    return trx.selectFrom('app.admin_profiles').select(['id', 'email']).where('is_super_admin', '=', true).where('status', '=', 'ACTIVE').execute();
  }
  // X8 interpretation: an active admin with support:edit whose data scope covers the ticket's cluster.
  const rows = await sql<{ id: string; email: string }>`
    select distinct a.id, a.email
      from app.admin_profiles a
      join app.admin_effective_grants g on g.admin_id = a.id and g.module_key = 'support' and g.action_key = 'edit'
     where a.status = 'ACTIVE' and not a.is_super_admin
       and (a.scope_type = 'GLOBAL' or exists (
             select 1 from app.admin_cluster_scopes s where s.admin_id = a.id and s.cluster_id = ${clusterId}))
  `.execute(trx);
  return rows.rows;
}

/**
 * Raises a ticket one level (or to an explicit level), records the escalation,
 * adds a system update and queues notifications. Runs inside the caller's tx.
 */
export async function escalate(
  trx: Tx,
  ticket: { id: string; cluster_id: string | null; escalation_level: EscalationLevel; reference: string },
  opts: { to?: 'CLUSTER_ADMIN' | 'SUPER_ADMIN'; trigger: 'OVERDUE' | 'URGENT' | 'MANUAL'; reason?: string | null; by?: string | null },
): Promise<EscalationLevel> {
  const to = opts.to ?? (ticket.escalation_level === 'NONE' ? 'CLUSTER_ADMIN' : 'SUPER_ADMIN');
  if (ticket.escalation_level === 'SUPER_ADMIN' || (ticket.escalation_level === 'CLUSTER_ADMIN' && to === 'CLUSTER_ADMIN')) {
    return ticket.escalation_level;
  }
  const [, second] = await stepDays(trx);
  const now = new Date();
  const next = to === 'CLUSTER_ADMIN' ? addWorkingDays(now, second, await holidaySet(trx)) : null;
  await trx
    .updateTable('app.support_tickets')
    .set({ escalation_level: to, escalated_at: now, next_escalation_at: next, due_at: next })
    .where('id', '=', ticket.id)
    .execute();
  const who = await recipients(trx, to, ticket.cluster_id);
  await trx
    .insertInto('app.ticket_escalations')
    .values({ ticket_id: ticket.id, cluster_id: ticket.cluster_id, level: to, trigger: opts.trigger, reason: opts.reason ?? null, escalated_by: opts.by ?? null, notified: who.length })
    .execute();
  await trx
    .insertInto('app.ticket_updates')
    .values({
      ticket_id: ticket.id,
      author_kind: 'system',
      author_id: opts.by ?? null,
      visibility: 'INTERNAL',
      body: `Escalated to ${to === 'CLUSTER_ADMIN' ? 'the Cluster Admin' : 'the Super Admin'} (${opts.trigger.toLowerCase()})${opts.reason ? `: ${opts.reason}` : ''}`,
    })
    .execute();
  if (who.length) {
    await trx
      .insertInto('app.notification_outbox')
      .values(
        who.map((a) => ({
          event_type: 'ticket.escalated',
          dedupe_key: `escalation:${ticket.id}:${to}:${a.id}`,
          channel: 'EMAIL' as const,
          recipient: a.email,
          payload: JSON.stringify({ ticketId: ticket.id, reference: ticket.reference, level: to, trigger: opts.trigger }),
        })),
      )
      .onConflict((oc) => oc.column('dedupe_key').doNothing())
      .execute();
  }
  return to;
}

/** Periodic job: escalate overdue open tickets one level. */
export async function escalateOverdue(db: Database, logger?: Logger): Promise<number> {
  const due = await withTx(db, SYSTEM_CLAIMS, (trx) =>
    trx
      .selectFrom('app.support_tickets')
      .select(['id'])
      .where('status', 'not in', ['RESOLVED', 'CLOSED'])
      .where('next_escalation_at', '<', new Date())
      .where('escalation_level', '!=', 'SUPER_ADMIN')
      .limit(200)
      .execute(),
  );
  let n = 0;
  for (const t of due) {
    try {
      await withTx(db, SYSTEM_CLAIMS, async (trx) => {
        const row = await trx
          .selectFrom('app.support_tickets')
          .select(['id', 'cluster_id', 'escalation_level', 'reference', 'status', 'next_escalation_at'])
          .where('id', '=', t.id)
          .forUpdate()
          .executeTakeFirst();
        if (!row || ['RESOLVED', 'CLOSED'].includes(row.status) || !row.next_escalation_at || new Date(row.next_escalation_at) > new Date()) return;
        await escalate(trx, row, { trigger: 'OVERDUE', reason: 'Not resolved within the working-day deadline' });
        n++;
      });
    } catch (err) {
      logger?.warn({ err, ticketId: t.id }, 'escalation failed');
    }
  }
  return n;
}
