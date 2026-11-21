import { sql } from 'kysely';
import {
  TICKET_TRANSITIONS,
  type AdminEnquiry,
  type AdminTicket,
  type AdminTicketDetail,
  type AdminTicketUpdateInput,
  type TicketAssignee,
  type TicketContext,
  type CreateTicketInput,
  type PatchTicketInput,
  type TicketCategory,
  type TicketDetail,
  type TicketStatus,
  type TicketSummary,
  type UpsertTicketCategoryInput,
} from '@nestovin/contracts';
import type { Database, Tx } from '../../db/database';
import { withTx } from '../../db/database';
import { toDbClaims, type AdminActor } from '../../auth/permissions';
import { businessRule, fromPgError, notFound, versionConflict } from '../../lib/errors';
import { decodeCursor, toPage } from '../../lib/pagination';
import { businessToday } from '../../lib/dates';
import { bookingViews } from '../bookings/views';
import { auditAdmin, auditResident } from '../audit/audit';
import { residentClaims, type ResidentActor } from '../residents/auth';
import { activeMembership } from '../residents/queries';
import { escalate, initialDeadline } from './escalation';
import { notify } from '../notifications/service';

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

/** Next status rules (pure; unit-tested). */
export function canMoveTicket(from: TicketStatus, to: TicketStatus): boolean {
  return from === to || TICKET_TRANSITIONS[from].includes(to);
}

/*
 * Support tickets (RES-12, ADM-13) and website enquiries (WEB-10).
 * Residents see their own and their household's tickets and only
 * RESIDENT-visible updates (RLS). Admins see tickets in their clusters.
 * Escalation (Cluster Admin -> Super Admin) and working-day deadlines: Phase 7.
 */
export class SupportService {
  constructor(private readonly db: Database) {}

  // ---------------------------------------------------------------- shared

  private ticketQuery(trx: Tx) {
    return trx
      .selectFrom('app.support_tickets as t')
      .innerJoin('app.ticket_categories as c', 'c.id', 't.category_id')
      .selectAll('t')
      .select('c.name as category_name');
  }

  private toSummary(r: Awaited<ReturnType<ReturnType<SupportService['ticketQuery']>['executeTakeFirstOrThrow']>>): TicketSummary {
    return {
      id: r.id,
      reference: r.reference,
      subject: r.subject,
      categoryId: r.category_id,
      categoryName: r.category_name,
      priority: r.priority,
      urgent: r.urgent,
      status: r.status,
      createdAt: iso(r.created_at)!,
      updatedAt: iso(r.updated_at)!,
    };
  }

  private async updates(trx: Tx, ticketId: string) {
    const rows = await trx
      .selectFrom('app.ticket_updates as u')
      .leftJoin('app.admin_profiles as a', (j) => j.onRef('a.id', '=', 'u.author_id').on('u.author_kind', '=', 'admin'))
      .leftJoin('app.resident_profiles as p', (j) => j.onRef('p.id', '=', 'u.author_id').on('u.author_kind', '=', 'resident'))
      .select(['u.id', 'u.author_kind', 'u.visibility', 'u.body', 'u.created_at', 'a.full_name as admin_name', 'p.full_name as resident_name'])
      .where('u.ticket_id', '=', ticketId)
      .orderBy('u.created_at')
      .execute();
    return rows.map((u) => ({
      id: String(u.id),
      authorKind: u.author_kind,
      // Residents see "Nestovin Support" rather than an individual admin's name.
      authorName: u.author_kind === 'resident' ? u.resident_name : u.admin_name,
      visibility: u.visibility,
      body: u.body,
      createdAt: iso(u.created_at)!,
    }));
  }

  // ------------------------------------------------------------- categories

  async categories(trx: Database | Tx, activeOnly: boolean): Promise<TicketCategory[]> {
    let q = trx.selectFrom('app.ticket_categories').selectAll().orderBy('sort').orderBy('name');
    if (activeOnly) q = q.where('status', '=', 'ACTIVE');
    return q.execute();
  }

  async upsertCategory(actor: AdminActor, requestId: string, id: string | null, input: UpsertTicketCategoryInput) {
    return withTx(this.db, toDbClaims(actor), async (trx) => {
      const values = { name: input.name, ...(input.status ? { status: input.status } : {}), ...(input.sort !== undefined ? { sort: input.sort } : {}) };
      const row = id
        ? await trx.updateTable('app.ticket_categories').set(values).where('id', '=', id).returning('id').executeTakeFirst()
        : await trx.insertInto('app.ticket_categories').values(values).returning('id').executeTakeFirst();
      if (!row) throw notFound('Category');
      await auditAdmin(trx, actor, requestId, {
        action: id ? 'ticket_category.updated' : 'ticket_category.created',
        targetType: 'ticket_category',
        targetId: row.id,
        after: values,
      });
      return this.categories(trx, false);
    }).catch((err: unknown) => {
      throw fromPgError(err, { ticket_categories_name_uq: { path: 'name', message: 'This category already exists' } }) ?? err;
    });
  }

  // --------------------------------------------------------- resident side

  async residentList(actor: ResidentActor): Promise<TicketSummary[]> {
    return withTx(this.db, residentClaims(actor), async (trx) => {
      const rows = await this.ticketQuery(trx).orderBy('t.created_at', 'desc').limit(100).execute();
      return rows.map((r) => this.toSummary(r));
    });
  }

  async residentDetail(actor: ResidentActor, id: string): Promise<TicketDetail> {
    return withTx(this.db, residentClaims(actor), async (trx) => {
      const t = await this.ticketQuery(trx).where('t.id', '=', id).executeTakeFirst();
      if (!t) throw notFound('Ticket');
      const updates = (await this.updates(trx, id)).map((u) => (u.authorKind === 'admin' ? { ...u, authorName: 'Nestovin Support' } : u));
      return { ...this.toSummary(t), description: t.description, updates };
    });
  }

  async residentCreate(actor: ResidentActor, requestId: string, input: CreateTicketInput): Promise<TicketDetail> {
    const id = await withTx(this.db, residentClaims(actor), async (trx) => {
      const cat = await trx.selectFrom('app.ticket_categories').select('status').where('id', '=', input.categoryId).executeTakeFirst();
      if (!cat || cat.status !== 'ACTIVE') throw notFound('Category');
      const m = await activeMembership(trx, actor.id);
      // ADR-014 working-day deadline for the first escalation.
      const deadline = await initialDeadline(trx, new Date());
      const row = await trx
        .insertInto('app.support_tickets')
        .values({
          resident_id: actor.id,
          membership_id: m?.id ?? null,
          flat_id: m?.flat_id ?? null,
          community_id: m?.community_id ?? null,
          cluster_id: m?.cluster_id ?? null,
          category_id: input.categoryId,
          subject: input.subject,
          description: input.description,
          next_escalation_at: deadline,
          due_at: deadline,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await auditResident(trx, actor.id, requestId, { action: 'ticket.created', targetType: 'support_ticket', targetId: row.id });
      return row.id;
    });
    return this.residentDetail(actor, id);
  }

  async residentReply(actor: ResidentActor, requestId: string, id: string, body: string): Promise<TicketDetail> {
    await withTx(this.db, residentClaims(actor), async (trx) => {
      const t = await trx.selectFrom('app.support_tickets').select(['id', 'status']).where('id', '=', id).forUpdate().executeTakeFirst();
      if (!t) throw notFound('Ticket');
      if (t.status === 'CLOSED') throw businessRule('This ticket is closed. Raise a new ticket if you still need help.');
      await trx.insertInto('app.ticket_updates').values({ ticket_id: id, author_kind: 'resident', author_id: actor.id, visibility: 'RESIDENT', body }).execute();
      // A reply to a ticket waiting on the resident puts it back in progress.
      if (t.status === 'WAITING') {
        await trx.updateTable('app.support_tickets').set({ status: 'IN_PROGRESS' }).where('id', '=', id).execute();
      }
      await auditResident(trx, actor.id, requestId, { action: 'ticket.replied', targetType: 'support_ticket', targetId: id });
    });
    return this.residentDetail(actor, id);
  }

  // ------------------------------------------------------------ admin side

  private adminQuery(trx: Tx) {
    return this.ticketQuery(trx)
      .innerJoin('app.resident_profiles as p', 'p.id', 't.resident_id')
      .leftJoin('app.flats as f', 'f.id', 't.flat_id')
      .leftJoin('app.towers as tw', 'tw.id', 'f.tower_id')
      .leftJoin('app.communities as co', 'co.id', 't.community_id')
      .leftJoin('app.admin_profiles as a', 'a.id', 't.owner_admin_id')
      .select([
        'p.full_name as resident_name', 'p.phone as resident_phone', 'f.flat_number', 'tw.name as tower_name',
        'co.name as community_name', 'a.full_name as owner_name',
      ]);
  }

  private toAdmin(r: Awaited<ReturnType<ReturnType<SupportService['adminQuery']>['executeTakeFirstOrThrow']>>): AdminTicket {
    return {
      ...this.toSummary(r),
      resident: { id: r.resident_id, fullName: r.resident_name, phone: r.resident_phone },
      flat: r.flat_number ? { flatNumber: r.flat_number, towerName: r.tower_name ?? '', communityName: r.community_name ?? '' } : null,
      ownerAdminId: r.owner_admin_id,
      ownerName: r.owner_name,
      escalationLevel: r.escalation_level,
      dueAt: r.due_at ? new Date(r.due_at).toISOString() : null,
      overdue: Boolean(r.next_escalation_at && new Date(r.next_escalation_at) < new Date() && !['RESOLVED', 'CLOSED'].includes(r.status)),
      version: r.version,
    };
  }

  async adminList(
    actor: AdminActor,
    p: { limit: number; cursor?: string | undefined; status?: string | undefined; categoryId?: string | undefined; priority?: string | undefined; mine?: boolean; open?: boolean; escalated?: boolean },
  ) {
    return withTx(this.db, toDbClaims(actor), async (trx) => {
      const cursor = decodeCursor(p.cursor);
      let q = this.adminQuery(trx);
      if (p.status) q = q.where('t.status', '=', p.status as TicketStatus);
      if (p.open) q = q.where('t.status', 'not in', ['RESOLVED', 'CLOSED']);
      if (p.categoryId) q = q.where('t.category_id', '=', p.categoryId);
      if (p.priority) q = q.where('t.priority', '=', p.priority as 'LOW' | 'NORMAL' | 'HIGH');
      if (p.mine) q = q.where('t.owner_admin_id', '=', actor.id);
      if (p.escalated) q = q.where('t.escalation_level', '!=', 'NONE').where('t.status', 'not in', ['RESOLVED', 'CLOSED']);
      if (cursor) {
        q = q.where((eb) =>
          eb.or([eb('t.created_at', '<', new Date(cursor.v)), eb.and([eb('t.created_at', '=', new Date(cursor.v)), eb('t.id', '<', cursor.id)])]),
        );
      }
      const rows = await q.orderBy('t.urgent', 'desc').orderBy('t.created_at', 'desc').orderBy('t.id', 'desc').limit(p.limit + 1).execute();
      const page = toPage(rows, p.limit, (r) => ({ v: new Date(r.created_at).toISOString(), id: r.id }));
      return { items: page.items.map((r) => this.toAdmin(r)), nextCursor: page.nextCursor };
    });
  }

  async adminDetail(actor: AdminActor, id: string): Promise<AdminTicketDetail> {
    return withTx(this.db, toDbClaims(actor), async (trx) => {
      const detail = await this.loadAdminDetail(trx, id);
      return { ...detail, context: await this.ticketContext(trx, id) };
    });
  }

  /**
   * Linked context for a ticket (ADM-13): the resident's flat, live bookings,
   * last 5 payments and last/next 5 visits. Runs under the admin's claims, so RLS
   * keeps every list inside the admin's clusters.
   */
  private async ticketContext(trx: Tx, ticketId: string): Promise<TicketContext> {
    const t = await trx.selectFrom('app.support_tickets').select(['resident_id', 'flat_id']).where('id', '=', ticketId).executeTakeFirstOrThrow();
    const flat = t.flat_id
      ? await trx
          .selectFrom('app.flats as f')
          .innerJoin('app.towers as tw', 'tw.id', 'f.tower_id')
          .innerJoin('app.communities as c', 'c.id', 'f.community_id')
          .select(['f.id', 'f.flat_number', 'tw.name as tower_name', 'c.id as community_id', 'c.name as community_name'])
          .where('f.id', '=', t.flat_id)
          .executeTakeFirst()
      : undefined;

    const live = (await bookingViews(trx, { residentId: t.resident_id, limit: 50 })).filter(
      (b) =>
        ['PENDING_PAYMENT', 'CONFIRMED', 'REVIEW_REQUIRED'].includes(b.status) &&
        (!b.subscription || b.subscription.status === 'ACTIVE' || b.subscription.status === 'PENDING_ACTIVATION'),
    );

    const payments = await trx
      .selectFrom('app.payment_orders')
      .select(['id', 'purpose', 'amount_paise', 'status', 'created_at', 'paid_at'])
      .where('resident_id', '=', t.resident_id)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(5)
      .execute();

    // Visits at the ticket's flat, or at any flat the resident subscribes for when the ticket has none.
    const today = businessToday();
    const visits = (direction: 'past' | 'next') => {
      let q = trx
        .selectFrom('app.service_occurrences as o')
        .innerJoin('app.services as sv', 'sv.id', 'o.service_id')
        .leftJoin('app.occurrence_assignments as a', (j) => j.onRef('a.occurrence_id', '=', 'o.id').on('a.status', '=', 'ACTIVE'))
        .leftJoin('app.employees as e', 'e.id', 'a.employee_id')
        .select(['o.id', 'o.scheduled_date', 'o.starts_at', 'o.status', 'sv.name as service_name', 'e.full_name as worker_name']);
      q = t.flat_id
        ? q.where('o.flat_id', '=', t.flat_id)
        : q.where('o.subscription_id', 'in', (eb) => eb.selectFrom('app.subscriptions').select('id').where('resident_id', '=', t.resident_id));
      q =
        direction === 'past'
          ? q.where('o.scheduled_date', '<', today).orderBy('o.scheduled_date', 'desc').orderBy('o.visit_no', 'desc')
          : q.where('o.scheduled_date', '>=', today).where('o.status', '!=', 'CANCELLED').orderBy('o.scheduled_date', 'asc').orderBy('o.visit_no', 'asc');
      return q.orderBy('o.id').limit(5).execute();
    };
    const toVisit = (v: Awaited<ReturnType<typeof visits>>[number]) => ({
      occurrenceId: v.id,
      scheduledDate: v.scheduled_date,
      startsAt: iso(v.starts_at),
      serviceName: v.service_name,
      status: v.status,
      workerName: v.worker_name,
    });

    return {
      flat: flat
        ? { flatId: flat.id, flatNumber: flat.flat_number, towerName: flat.tower_name, communityId: flat.community_id, communityName: flat.community_name }
        : null,
      bookings: live.map((b) => ({
        bookingId: b.id,
        reference: b.reference,
        planName: b.planName,
        selectionLabel: b.selectionLabel,
        status: b.status,
        startDate: b.startDate,
        totalPaise: b.totalPaise,
        outstandingPaise: b.outstandingPaise,
        subscription: b.subscription
          ? { id: b.subscription.id, status: b.subscription.status, periodStart: b.subscription.periodStart, periodEnd: b.subscription.periodEnd }
          : null,
      })),
      payments: payments.map((o) => ({
        id: o.id,
        purpose: o.purpose,
        amountPaise: Number(o.amount_paise),
        status: o.status,
        createdAt: iso(o.created_at)!,
        paidAt: iso(o.paid_at),
      })),
      recentVisits: (await visits('past')).map(toVisit),
      upcomingVisits: (await visits('next')).map(toVisit),
    };
  }

  // ------------------------------------------------------------ assignment

  /**
   * Admins who may own this ticket (ADM-13): active, holding support:edit (or the
   * Super Admin), with a data scope that covers the ticket's cluster. A ticket
   * with no cluster can only go to global-scope admins.
   */
  private async eligibleAssignees(trx: Tx, clusterId: string | null, ownerId: string | null, only?: string): Promise<TicketAssignee[]> {
    const rows = await sql<{ id: string; full_name: string; email: string; title: string | null; is_super_admin: boolean; scope_type: 'GLOBAL' | 'CLUSTERS'; open_tickets: number }>`
      select a.id, a.full_name, a.email, a.title, a.is_super_admin, a.scope_type,
             (select count(*)::int from app.support_tickets t
               where t.owner_admin_id = a.id and t.status not in ('RESOLVED', 'CLOSED')) as open_tickets
        from app.admin_profiles a
       where a.status = 'ACTIVE'
         and (a.is_super_admin or exists (
               select 1 from app.admin_effective_grants g
                where g.admin_id = a.id and g.module_key = 'support' and g.action_key = 'edit'))
         and (a.is_super_admin or a.scope_type = 'GLOBAL' or (${clusterId}::uuid is not null and exists (
               select 1 from app.admin_cluster_scopes s where s.admin_id = a.id and s.cluster_id = ${clusterId}::uuid)))
         ${only ? sql`and a.id = ${only}::uuid` : sql``}
       order by lower(a.full_name), a.id
       limit 500
    `.execute(trx);
    return rows.rows.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      email: r.email,
      title: r.title,
      isSuperAdmin: r.is_super_admin,
      scopeType: r.is_super_admin ? 'GLOBAL' : r.scope_type,
      isCurrentOwner: r.id === ownerId,
      openTickets: r.open_tickets,
    }));
  }

  async assignees(actor: AdminActor, id: string): Promise<TicketAssignee[]> {
    return withTx(this.db, toDbClaims(actor), async (trx) => {
      const t = await trx.selectFrom('app.support_tickets').select(['cluster_id', 'owner_admin_id']).where('id', '=', id).executeTakeFirst();
      if (!t) throw notFound('Ticket');
      return this.eligibleAssignees(trx, t.cluster_id, t.owner_admin_id);
    });
  }

  /**
   * Assign or reassign a ticket to an eligible admin (ADM-13). Adds an internal
   * update, emails the new owner through the outbox and audits before/after.
   * An open ticket moves to ASSIGNED; other statuses are kept.
   */
  async assign(actor: AdminActor, requestId: string, id: string, adminId: string): Promise<AdminTicketDetail> {
    return withTx(this.db, toDbClaims(actor), async (trx) => {
      const before = await trx.selectFrom('app.support_tickets').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!before) throw notFound('Ticket');
      if (before.status === 'RESOLVED' || before.status === 'CLOSED') throw businessRule('A resolved or closed ticket cannot be assigned. Reopen it first.');
      if (before.owner_admin_id === adminId) throw businessRule('This admin already owns the ticket');
      const [target] = await this.eligibleAssignees(trx, before.cluster_id, before.owner_admin_id, adminId);
      if (!target) throw businessRule('Choose an active admin with support access to this ticket’s cluster');

      const status = before.status === 'OPEN' ? 'ASSIGNED' : before.status;
      await trx.updateTable('app.support_tickets').set({ owner_admin_id: adminId, status }).where('id', '=', id).execute();

      const previous = before.owner_admin_id
        ? await trx.selectFrom('app.admin_profiles').select('full_name').where('id', '=', before.owner_admin_id).executeTakeFirst()
        : undefined;
      const body = previous
        ? `Reassigned from ${previous.full_name} to ${target.fullName} by ${actor.fullName}`
        : `Assigned to ${target.fullName} by ${actor.fullName}`;
      const update = await trx
        .insertInto('app.ticket_updates')
        .values({ ticket_id: id, author_kind: 'system', author_id: actor.id, visibility: 'INTERNAL', body })
        .returning('id')
        .executeTakeFirstOrThrow();
      if (status !== before.status) {
        await trx
          .insertInto('app.ticket_updates')
          .values({ ticket_id: id, author_kind: 'system', author_id: actor.id, visibility: 'RESIDENT', body: `Status changed to ${status.toLowerCase()}` })
          .execute();
        await notify(trx, 'ticket.status_changed', before.resident_id, { ticketId: id, status });
      }
      // Email the new owner (same outbox pattern as escalations); not when assigning to oneself.
      if (adminId !== actor.id) {
        await trx
          .insertInto('app.notification_outbox')
          .values({
            event_type: 'ticket.assigned',
            dedupe_key: `ticket_assigned:${id}:${adminId}:${update.id}`,
            channel: 'EMAIL',
            recipient: target.email,
            payload: JSON.stringify({ ticketId: id, reference: before.reference, assignedBy: actor.fullName }),
          })
          .onConflict((oc) => oc.column('dedupe_key').doNothing())
          .execute();
      }
      await auditAdmin(trx, actor, requestId, {
        action: before.owner_admin_id ? 'ticket.reassigned' : 'ticket.assigned',
        targetType: 'support_ticket',
        targetId: id,
        before: { owner: before.owner_admin_id, status: before.status },
        after: { owner: adminId, status },
      });
      return this.loadAdminDetail(trx, id);
    });
  }

  private async loadAdminDetail(trx: Tx, id: string): Promise<AdminTicketDetail> {
    const t = await this.adminQuery(trx).where('t.id', '=', id).executeTakeFirst();
    if (!t) throw notFound('Ticket');
    return {
      ...this.toAdmin(t),
      description: t.description,
      updates: await this.updates(trx, id),
      allowedStatuses: [...TICKET_TRANSITIONS[t.status]],
      escalations: (await trx.selectFrom('app.ticket_escalations').selectAll().where('ticket_id', '=', id).orderBy('created_at').execute()).map((e) => ({
        level: e.level,
        trigger: e.trigger,
        reason: e.reason,
        notified: e.notified,
        at: new Date(e.created_at).toISOString(),
      })),
    };
  }

  async adminPatch(actor: AdminActor, requestId: string, id: string, input: PatchTicketInput): Promise<AdminTicketDetail> {
    return withTx(this.db, toDbClaims(actor), async (trx) => {
      const before = await trx.selectFrom('app.support_tickets').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!before) throw notFound('Ticket');
      if (before.version !== input.version) throw versionConflict();

      if (input.categoryId) {
        const cat = await trx.selectFrom('app.ticket_categories').select('status').where('id', '=', input.categoryId).executeTakeFirst();
        if (!cat) throw notFound('Category');
      }
      if (input.ownerAdminId) {
        const owner = await trx.selectFrom('app.admin_profiles').select('status').where('id', '=', input.ownerAdminId).executeTakeFirst();
        if (!owner || owner.status !== 'ACTIVE') throw businessRule('Choose an active admin as the owner');
      }

      let status = input.status ?? before.status;
      // Assigning an owner to an open ticket marks it assigned.
      if (input.ownerAdminId && !input.status && before.status === 'OPEN') status = 'ASSIGNED';
      if (!canMoveTicket(before.status, status)) {
        throw businessRule(`A ${before.status.toLowerCase().replace('_', ' ')} ticket cannot move to ${status.toLowerCase().replace('_', ' ')}`);
      }

      await trx
        .updateTable('app.support_tickets')
        .set({
          ...(input.categoryId ? { category_id: input.categoryId } : {}),
          ...(input.priority ? { priority: input.priority } : {}),
          ...(input.urgent !== undefined ? { urgent: input.urgent } : {}),
          ...(input.ownerAdminId !== undefined ? { owner_admin_id: input.ownerAdminId } : {}),
          status,
          ...(status === 'RESOLVED' && before.status !== 'RESOLVED' ? { resolved_at: sql`now()` } : {}),
          ...(status === 'CLOSED' ? { closed_at: sql`now()` } : {}),
        })
        .where('id', '=', id)
        .execute();

      // Deadline tracking stops when resolved/closed and restarts on reopening.
      if (['RESOLVED', 'CLOSED'].includes(status)) {
        await trx.updateTable('app.support_tickets').set({ next_escalation_at: null }).where('id', '=', id).execute();
      } else if (before.status === 'RESOLVED' && before.escalation_level !== 'SUPER_ADMIN') {
        const d = await initialDeadline(trx, new Date());
        await trx.updateTable('app.support_tickets').set({ next_escalation_at: d, due_at: d }).where('id', '=', id).execute();
      }
      // Urgent path (ADR-014): straight to the Cluster Admin.
      if (input.urgent && !before.urgent && before.escalation_level === 'NONE' && !['RESOLVED', 'CLOSED'].includes(status)) {
        await escalate(trx, before, { to: 'CLUSTER_ADMIN', trigger: 'URGENT', reason: 'Marked urgent', by: actor.id });
      }
      if (status !== before.status) {
        await trx
          .insertInto('app.ticket_updates')
          .values({ ticket_id: id, author_kind: 'system', author_id: actor.id, visibility: 'RESIDENT', body: `Status changed to ${status.replace('_', ' ').toLowerCase()}` })
          .execute();
        await notify(trx, 'ticket.status_changed', before.resident_id, { ticketId: id, status });
      }
      await auditAdmin(trx, actor, requestId, {
        action: 'ticket.updated',
        targetType: 'support_ticket',
        targetId: id,
        before: { status: before.status, priority: before.priority, urgent: before.urgent, owner: before.owner_admin_id, category: before.category_id },
        after: { status, ...input },
      });
      return this.loadAdminDetail(trx, id);
    });
  }

  /** Manual escalation by Support with a reason (ADM-13). Support keeps ownership. */
  async adminEscalate(actor: AdminActor, requestId: string, id: string, reason: string): Promise<AdminTicketDetail> {
    return withTx(this.db, toDbClaims(actor), async (trx) => {
      const t = await trx.selectFrom('app.support_tickets').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!t) throw notFound('Ticket');
      if (['RESOLVED', 'CLOSED'].includes(t.status)) throw businessRule('A resolved or closed ticket cannot be escalated');
      if (t.escalation_level === 'SUPER_ADMIN') throw businessRule('This ticket is already with the Super Admin');
      const level = await escalate(trx, t, { trigger: 'MANUAL', reason, by: actor.id });
      await auditAdmin(trx, actor, requestId, { action: 'ticket.escalated', targetType: 'support_ticket', targetId: id, reason, after: { level } });
      return this.loadAdminDetail(trx, id);
    });
  }

  async adminAddUpdate(actor: AdminActor, requestId: string, id: string, input: AdminTicketUpdateInput): Promise<AdminTicketDetail> {
    return withTx(this.db, toDbClaims(actor), async (trx) => {
      const t = await trx.selectFrom('app.support_tickets').select(['id', 'status']).where('id', '=', id).executeTakeFirst();
      if (!t) throw notFound('Ticket');
      if (t.status === 'CLOSED') throw businessRule('This ticket is closed');
      await trx
        .insertInto('app.ticket_updates')
        .values({ ticket_id: id, author_kind: 'admin', author_id: actor.id, visibility: input.visibility, body: input.body })
        .execute();
      if (input.visibility === 'RESIDENT') {
        const owner = await trx.selectFrom('app.support_tickets').select('resident_id').where('id', '=', id).executeTakeFirstOrThrow();
        await notify(trx, 'ticket.replied', owner.resident_id, { ticketId: id });
      }
      await auditAdmin(trx, actor, requestId, {
        action: input.visibility === 'INTERNAL' ? 'ticket.internal_note' : 'ticket.replied',
        targetType: 'support_ticket',
        targetId: id,
      });
      return this.loadAdminDetail(trx, id);
    });
  }

  // ------------------------------------------------------------- holidays

  async holidays() {
    const rows = await withTx(this.db, { userId: null, actorKind: 'system', isSuperAdmin: false, clusterIds: [] }, (trx) =>
      trx.selectFrom('app.business_holidays').select(['holiday_date', 'name']).where('holiday_date', '>=', sql<string>`(now() at time zone 'Asia/Kolkata')::date - 30`).orderBy('holiday_date').execute(),
    );
    return rows.map((r) => ({ date: r.holiday_date, name: r.name }));
  }

  async addHoliday(actor: AdminActor, requestId: string, input: { date: string; name: string }) {
    await withTx(this.db, toDbClaims(actor), async (trx) => {
      await trx
        .insertInto('app.business_holidays')
        .values({ holiday_date: input.date, name: input.name, created_by: actor.id })
        .onConflict((oc) => oc.column('holiday_date').doNothing())
        .execute();
      await auditAdmin(trx, actor, requestId, { action: 'holiday.added', targetType: 'business_holiday', targetId: null, after: input });
    });
    return this.holidays();
  }

  async removeHoliday(actor: AdminActor, requestId: string, date: string) {
    await withTx(this.db, toDbClaims(actor), async (trx) => {
      await trx.deleteFrom('app.business_holidays').where('holiday_date', '=', date).execute();
      await auditAdmin(trx, actor, requestId, { action: 'holiday.removed', targetType: 'business_holiday', targetId: null, before: { date } });
    });
    return this.holidays();
  }

  // ------------------------------------------------------------- enquiries

  async enquiries(actor: AdminActor, p: { limit: number; cursor?: string | undefined; status?: string | undefined }) {
    return withTx(this.db, toDbClaims(actor), async (trx) => {
      const cursor = decodeCursor(p.cursor);
      let q = trx.selectFrom('app.website_enquiries').selectAll();
      if (p.status) q = q.where('status', '=', p.status as AdminEnquiry['status']);
      if (cursor) {
        q = q.where((eb) =>
          eb.or([eb('created_at', '<', new Date(cursor.v)), eb.and([eb('created_at', '=', new Date(cursor.v)), eb('id', '<', cursor.id)])]),
        );
      }
      const rows = await q.orderBy('created_at', 'desc').orderBy('id', 'desc').limit(p.limit + 1).execute();
      const page = toPage(rows, p.limit, (r) => ({ v: new Date(r.created_at).toISOString(), id: r.id }));
      const items: AdminEnquiry[] = page.items.map((r) => ({
        id: r.id,
        reference: r.reference,
        name: r.name,
        phone: r.phone,
        email: r.email,
        city: r.city,
        community: r.community,
        message: r.message,
        status: r.status,
        routingStatus: r.routing_status,
        createdAt: iso(r.created_at)!,
      }));
      return { items, nextCursor: page.nextCursor };
    });
  }

  async setEnquiryStatus(actor: AdminActor, requestId: string, id: string, status: AdminEnquiry['status']) {
    return withTx(this.db, toDbClaims(actor), async (trx) => {
      const r = await trx.updateTable('app.website_enquiries').set({ status }).where('id', '=', id).returning('id').executeTakeFirst();
      if (!r) throw notFound('Enquiry');
      await auditAdmin(trx, actor, requestId, { action: 'enquiry.status_changed', targetType: 'website_enquiry', targetId: id, after: { status } });
      return { status };
    });
  }
}
