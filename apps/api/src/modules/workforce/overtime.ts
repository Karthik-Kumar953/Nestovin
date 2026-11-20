import { sql } from 'kysely';
import { z } from 'zod';
import type { Database, Tx } from '../../db/database';
import { withTx } from '../../db/database';
import { inScope, toDbClaims, type AdminActor } from '../../auth/permissions';
import { businessRule, conflict, notFound } from '../../lib/errors';
import { auditAdmin } from '../audit/audit';
import { AllocationService } from './allocation';
import { employeeClaims, type EmployeeActor } from './employee-service';

export const createOfferSchema = z.object({ employeeIds: z.array(z.uuid()).min(1).max(20), note: z.string().trim().max(500).optional() });
export const respondOfferSchema = z.object({ response: z.enum(['ACCEPTED', 'REJECTED']) });
export const confirmOfferSchema = z.object({ employeeId: z.uuid() });

export interface OvertimeOfferView {
  id: string;
  status: 'OPEN' | 'FILLED' | 'CANCELLED';
  note: string | null;
  createdAt: string;
  visit: { occurrenceId: string; scheduledDate: string; startsAt: string | null; endsAt: string | null; serviceName: string; flat: { flatNumber: string; towerName: string; communityName: string } };
  responses: { employeeId: string; employeeCode: string; fullName: string; response: 'PENDING' | 'ACCEPTED' | 'REJECTED'; respondedAt: string | null }[];
  confirmedEmployeeId: string | null;
}

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

/**
 * EMP-08. Hard safety filters only (active, ready, qualified, same cluster, not
 * on leave, no overlapping visit). Normal availability windows and the work
 * limit are not applied because the work is additional by nature; eligibility,
 * expiry and pay are OPEN.
 */
export class OvertimeService {
  private readonly alloc: AllocationService;
  constructor(private readonly db: Database) {
    this.alloc = new AllocationService(db);
  }

  private async safety(trx: Tx, employeeId: string, o: { id: string; service_id: string; cluster_id: string | null; scheduled_date: string; starts_at: Date | null; ends_at: Date | null }) {
    const reasons = await this.alloc.employeeBasics(trx, employeeId, o.service_id, o.cluster_id);
    const dated = (await this.alloc.occurrenceReasons(trx, employeeId, o)).filter((r) => !r.startsWith('Daily work limit'));
    return [...reasons, ...dated];
  }

  private async visit(trx: Tx, actor: AdminActor, occurrenceId: string) {
    const o = await trx.selectFrom('app.service_occurrences').selectAll().where('id', '=', occurrenceId).forUpdate().executeTakeFirst();
    if (!o || !inScope(actor, o.cluster_id)) throw notFound('Visit');
    return o;
  }

  /** Workers who may be offered this visit, with reasons for the others. */
  async candidates(actor: AdminActor, occurrenceId: string) {
    return withTx(this.db, toDbClaims(actor), async (trx) => {
      const o = await this.visit(trx, actor, occurrenceId);
      const employees = await trx
        .selectFrom('app.employees')
        .select(['id', 'employee_code', 'full_name'])
        .where('home_cluster_id', '=', o.cluster_id ?? '00000000-0000-0000-0000-000000000000')
        .where('status', '=', 'ACTIVE')
        .orderBy('full_name')
        .execute();
      const eligible: { employeeId: string; employeeCode: string; fullName: string }[] = [];
      const excluded: { employeeId: string; employeeCode: string; fullName: string; reasons: string[] }[] = [];
      for (const e of employees) {
        const reasons = await this.safety(trx, e.id, o);
        if (reasons.length) excluded.push({ employeeId: e.id, employeeCode: e.employee_code, fullName: e.full_name, reasons });
        else eligible.push({ employeeId: e.id, employeeCode: e.employee_code, fullName: e.full_name });
      }
      return { eligible, excluded };
    });
  }

  async offer(actor: AdminActor, requestId: string, occurrenceId: string, input: { employeeIds: string[]; note?: string | undefined }) {
    return withTx(this.db, toDbClaims(actor), async (trx) => {
      const o = await this.visit(trx, actor, occurrenceId);
      if (!['SCHEDULED', 'ASSIGNED'].includes(o.status) || !o.starts_at) throw businessRule('Only an upcoming visit with a set time can be offered');
      const active = await trx.selectFrom('app.occurrence_assignments').select('id').where('occurrence_id', '=', o.id).where('status', '=', 'ACTIVE').executeTakeFirst();
      if (active) throw businessRule('This visit already has a worker');
      const ids = [...new Set(input.employeeIds)];
      for (const id of ids) {
        const reasons = await this.safety(trx, id, o);
        if (reasons.length) throw businessRule(`One of the selected workers cannot take this visit: ${reasons.join('; ')}`);
      }
      const offer = await trx
        .insertInto('app.overtime_offers')
        .values({ occurrence_id: o.id, cluster_id: o.cluster_id, note: input.note ?? null, created_by: actor.id })
        .returning('id')
        .executeTakeFirstOrThrow()
        .catch((err: unknown) => {
          if ((err as { code?: string }).code === '23505') throw conflict('This visit already has an open overtime offer');
          throw err;
        });
      await trx.insertInto('app.overtime_offer_responses').values(ids.map((employee_id) => ({ offer_id: offer.id, employee_id, cluster_id: o.cluster_id }))).execute();
      await trx
        .insertInto('app.notification_outbox')
        .values(ids.map((id) => ({ event_type: 'overtime.offered', dedupe_key: `overtime:${offer.id}:${id}`, channel: 'PUSH' as const, recipient: id, payload: JSON.stringify({ offerId: offer.id }) })))
        .execute();
      await auditAdmin(trx, actor, requestId, { action: 'overtime.offered', targetType: 'service_occurrence', targetId: o.id, after: { offerId: offer.id, employees: ids.length } });
      return (await this.load(trx, { offerId: offer.id }))[0]!;
    });
  }

  private async load(trx: Tx, f: { offerId?: string; status?: string; employeeId?: string }): Promise<OvertimeOfferView[]> {
    let q = trx
      .selectFrom('app.overtime_offers as x')
      .innerJoin('app.service_occurrences as o', 'o.id', 'x.occurrence_id')
      .innerJoin('app.services as s', 's.id', 'o.service_id')
      .innerJoin('app.flats as f', 'f.id', 'o.flat_id')
      .innerJoin('app.towers as t', 't.id', 'f.tower_id')
      .innerJoin('app.communities as c', 'c.id', 'o.community_id')
      .selectAll('x')
      .select(['o.scheduled_date', 'o.starts_at', 'o.ends_at', 's.name as service_name', 'f.flat_number', 't.name as tower_name', 'c.name as community_name']);
    if (f.offerId) q = q.where('x.id', '=', f.offerId);
    if (f.status) q = q.where('x.status', '=', f.status as OvertimeOfferView['status']);
    const offers = await q.orderBy('o.scheduled_date').limit(200).execute();
    if (!offers.length) return [];
    let rq = trx
      .selectFrom('app.overtime_offer_responses as r')
      .innerJoin('app.employees as e', 'e.id', 'r.employee_id')
      .select(['r.offer_id', 'r.employee_id', 'r.response', 'r.responded_at', 'e.employee_code', 'e.full_name'])
      .where('r.offer_id', 'in', offers.map((o) => o.id));
    if (f.employeeId) rq = rq.where('r.employee_id', '=', f.employeeId);
    const responses = await rq.execute();
    return offers.map((o) => ({
      id: o.id,
      status: o.status,
      note: o.note,
      createdAt: iso(o.created_at)!,
      visit: { occurrenceId: o.occurrence_id, scheduledDate: o.scheduled_date, startsAt: iso(o.starts_at), endsAt: iso(o.ends_at), serviceName: o.service_name, flat: { flatNumber: o.flat_number, towerName: o.tower_name, communityName: o.community_name } },
      responses: responses.filter((r) => r.offer_id === o.id).map((r) => ({ employeeId: r.employee_id, employeeCode: r.employee_code, fullName: r.full_name, response: r.response, respondedAt: iso(r.responded_at) })),
      confirmedEmployeeId: o.confirmed_employee_id,
    }));
  }

  async list(actor: AdminActor, status: string) {
    return withTx(this.db, toDbClaims(actor), (trx) => this.load(trx, { status }));
  }

  /** Admin confirmation of one acceptance creates the schedule entry; other offers close. */
  async confirm(actor: AdminActor, requestId: string, offerId: string, employeeId: string) {
    return withTx(this.db, toDbClaims(actor), async (trx) => {
      const offer = await trx.selectFrom('app.overtime_offers').selectAll().where('id', '=', offerId).forUpdate().executeTakeFirst();
      if (!offer || !inScope(actor, offer.cluster_id)) throw notFound('Overtime offer');
      if (offer.status !== 'OPEN') throw businessRule('This offer is no longer open');
      const r = await trx.selectFrom('app.overtime_offer_responses').select('response').where('offer_id', '=', offerId).where('employee_id', '=', employeeId).executeTakeFirst();
      if (!r || r.response !== 'ACCEPTED') throw businessRule('Only a worker who accepted the offer can be confirmed');
      const o = await this.visit(trx, actor, offer.occurrence_id);
      await trx.selectFrom('app.employees').select('id').where('id', '=', employeeId).forUpdate().executeTakeFirst();
      const reasons = await this.safety(trx, employeeId, o);
      if (reasons.length) throw businessRule(`This worker can no longer take the visit: ${reasons.join('; ')}`);
      const active = await trx.selectFrom('app.occurrence_assignments').select('id').where('occurrence_id', '=', o.id).where('status', '=', 'ACTIVE').executeTakeFirst();
      if (active) throw businessRule('This visit already has a worker');
      await trx
        .insertInto('app.occurrence_assignments')
        .values({ occurrence_id: o.id, employee_id: employeeId, cluster_id: o.cluster_id, source: 'OVERTIME', starts_at: o.starts_at, ends_at: o.ends_at, assigned_by: actor.id, reason: 'Confirmed overtime offer' })
        .execute();
      await trx.updateTable('app.service_occurrences').set({ status: 'ASSIGNED' }).where('id', '=', o.id).execute();
      await trx.updateTable('app.overtime_offers').set({ status: 'FILLED', confirmed_employee_id: employeeId, closed_at: sql`now()` }).where('id', '=', offerId).execute();
      await auditAdmin(trx, actor, requestId, { action: 'overtime.confirmed', targetType: 'service_occurrence', targetId: o.id, after: { offerId, employeeId } });
      await trx
        .insertInto('app.notification_outbox')
        .values({ event_type: 'overtime.confirmed', dedupe_key: `overtime_confirmed:${offerId}`, channel: 'PUSH', recipient: employeeId, payload: JSON.stringify({ offerId, occurrenceId: o.id }) })
        .execute();
      return (await this.load(trx, { offerId }))[0]!;
    });
  }

  async cancel(actor: AdminActor, requestId: string, offerId: string) {
    return withTx(this.db, toDbClaims(actor), async (trx) => {
      const offer = await trx.selectFrom('app.overtime_offers').select(['id', 'status', 'cluster_id', 'occurrence_id']).where('id', '=', offerId).forUpdate().executeTakeFirst();
      if (!offer || !inScope(actor, offer.cluster_id)) throw notFound('Overtime offer');
      if (offer.status !== 'OPEN') throw businessRule('This offer is no longer open');
      await trx.updateTable('app.overtime_offers').set({ status: 'CANCELLED', closed_at: sql`now()` }).where('id', '=', offerId).execute();
      await auditAdmin(trx, actor, requestId, { action: 'overtime.cancelled', targetType: 'service_occurrence', targetId: offer.occurrence_id });
      return { status: 'CANCELLED' as const };
    });
  }

  // ------------------------------------------------------------------ worker

  async mine(actor: EmployeeActor) {
    return withTx(this.db, employeeClaims(actor), (trx) => this.load(trx, { employeeId: actor.id }));
  }

  /** Accept or reject while the offer is open. Acceptance alone is not an assignment. */
  async respond(actor: EmployeeActor, offerId: string, response: 'ACCEPTED' | 'REJECTED') {
    await withTx(this.db, employeeClaims(actor), async (trx) => {
      const offer = await trx.selectFrom('app.overtime_offers').select('status').where('id', '=', offerId).executeTakeFirst();
      if (!offer) throw notFound('Offer');
      if (offer.status !== 'OPEN') throw businessRule('This offer is no longer open');
      const r = await trx
        .updateTable('app.overtime_offer_responses')
        .set({ response, responded_at: sql`now()` })
        .where('offer_id', '=', offerId)
        .where('employee_id', '=', actor.id)
        .executeTakeFirst();
      if (r.numUpdatedRows === 0n) throw notFound('Offer');
    });
    return this.mine(actor);
  }
}
