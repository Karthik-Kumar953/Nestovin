import { sql } from 'kysely';
import type { AllocationNeed, Candidates, ConfirmStandingInput, Occurrence } from '@nestovin/contracts';
import type { Database, Tx } from '../../db/database';
import { withTx } from '../../db/database';
import { inScope, toDbClaims, type AdminActor } from '../../auth/permissions';
import { businessRule, notFound } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import { auditAdmin } from '../audit/audit';
import { SYSTEM_CLAIMS, setting } from '../bookings/payments';

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());
const today = () => new Date().toISOString().slice(0, 10);

/** Minutes since midnight for 'HH:MM[:SS]'. */
export const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** Two weekly patterns clash when they share a day and their times overlap. */
export function patternsOverlap(a: { days: number; start: string; minutes: number }, b: { days: number; start: string; minutes: number }): boolean {
  if ((a.days & b.days) === 0) return false;
  const as = minutesOf(a.start);
  const bs = minutesOf(b.start);
  return as < bs + b.minutes && bs < as + a.minutes;
}
/** A pattern fits availability when, on every pattern day, one window covers the time. */
export function fitsAvailability(p: { days: number; start: string; minutes: number }, windows: { days: number; start: string; end: string }[]): boolean {
  if (windows.length === 0) return true; // no rules = not restricted (EMP-09)
  const s = minutesOf(p.start);
  const e = s + p.minutes;
  for (let bit = 0; bit < 7; bit++) {
    if (!(p.days & (1 << bit))) continue;
    const ok = windows.some((w) => w.days & (1 << bit) && minutesOf(w.start) <= s && minutesOf(w.end) >= e);
    if (!ok) return false;
  }
  return true;
}

interface ComponentCtx {
  id: string;
  subscriptionId: string;
  serviceId: string;
  clusterId: string | null;
  startTime: string;
  durationMinutes: number;
  daysOfWeek: number;
  periodStart: string;
  periodEnd: string;
}

/**
 * ADM-11 allocation with the confirmed eligibility filters (ADR-005): active +
 * ready, qualified for the service, same cluster, not on approved leave, no
 * overlapping assignment, within availability and the work limit (if set).
 * There is no ranking (OPEN): Operations chooses among eligible employees.
 */
export class AllocationService {
  constructor(
    private readonly db: Database,
    private readonly logger?: Logger,
  ) {}

  private tx<T>(actor: AdminActor, fn: (trx: Tx) => Promise<T>) {
    return withTx(this.db, toDbClaims(actor), fn);
  }

  private async component(trx: Tx, actor: AdminActor | null, componentId: string): Promise<ComponentCtx> {
    const c = await trx
      .selectFrom('app.subscription_components as c')
      .innerJoin('app.subscriptions as s', 's.id', 'c.subscription_id')
      .select(['c.id', 'c.subscription_id', 'c.service_id', 'c.cluster_id', 'c.start_time', 'c.duration_minutes', 'c.days_of_week', 's.period_start', 's.period_end', 's.status'])
      .where('c.id', '=', componentId)
      .executeTakeFirst();
    if (!c || (actor && !inScope(actor, c.cluster_id))) throw notFound('Service');
    if (!['PENDING_ACTIVATION', 'ACTIVE'].includes(c.status)) throw businessRule('This subscription is not current');
    return {
      id: c.id,
      subscriptionId: c.subscription_id,
      serviceId: c.service_id,
      clusterId: c.cluster_id,
      startTime: c.start_time.slice(0, 5),
      durationMinutes: c.duration_minutes,
      daysOfWeek: c.days_of_week,
      periodStart: c.period_start,
      periodEnd: c.period_end,
    };
  }

  /** Hard filters for a standing assignment of an employee to a weekly pattern. */
  private async standingReasons(trx: Tx, employeeId: string, c: ComponentCtx, ignoreComponentId?: string): Promise<{ reasons: string[]; standingCount: number }> {
    const e = await trx.selectFrom('app.employees').select(['status', 'readiness', 'home_cluster_id']).where('id', '=', employeeId).executeTakeFirst();
    if (!e) return { reasons: ['Employee not found'], standingCount: 0 };
    const reasons: string[] = [];
    if (e.status !== 'ACTIVE') reasons.push('Not active');
    if (e.readiness !== 'READY') reasons.push('Not deployment-ready');
    if (e.home_cluster_id !== c.clusterId) reasons.push('Outside the authorised cluster');
    const q = await trx.selectFrom('app.employee_qualifications').select('service_id').where('employee_id', '=', employeeId).where('service_id', '=', c.serviceId).executeTakeFirst();
    if (!q) reasons.push('Not qualified for this service');
    const windows = await trx.selectFrom('app.employee_availability').select(['days_of_week', 'start_time', 'end_time']).where('employee_id', '=', employeeId).execute();
    const pattern = { days: c.daysOfWeek, start: c.startTime, minutes: c.durationMinutes };
    if (!fitsAvailability(pattern, windows.map((w) => ({ days: w.days_of_week, start: w.start_time, end: w.end_time })))) reasons.push('Outside availability');
    const standing = await trx
      .selectFrom('app.standing_assignments as a')
      .innerJoin('app.subscription_components as sc', 'sc.id', 'a.subscription_component_id')
      .innerJoin('app.subscriptions as s', 's.id', 'sc.subscription_id')
      .select(['sc.id', 'sc.start_time', 'sc.duration_minutes', 'sc.days_of_week', 's.period_start', 's.period_end'])
      .where('a.employee_id', '=', employeeId)
      .where('a.status', '=', 'ACTIVE')
      .execute();
    const clashing = standing.filter(
      (s) =>
        s.id !== ignoreComponentId &&
        s.period_start <= c.periodEnd &&
        s.period_end >= c.periodStart &&
        patternsOverlap(pattern, { days: s.days_of_week, start: s.start_time, minutes: s.duration_minutes }),
    );
    if (clashing.length) reasons.push('Already has a standing assignment at this time');
    return { reasons, standingCount: standing.length };
  }

  /** Date-specific checks for one occurrence. */
  private async occurrenceReasons(trx: Tx, employeeId: string, o: { id: string; scheduled_date: string; starts_at: Date | null; ends_at: Date | null }): Promise<string[]> {
    const reasons: string[] = [];
    const leave = await trx
      .selectFrom('app.leave_requests')
      .select('id')
      .where('employee_id', '=', employeeId)
      .where('status', '=', 'APPROVED')
      .where('start_date', '<=', o.scheduled_date)
      .where('end_date', '>=', o.scheduled_date)
      .executeTakeFirst();
    if (leave) reasons.push(`On approved leave on ${o.scheduled_date}`);
    if (o.starts_at && o.ends_at) {
      const overlap = await trx
        .selectFrom('app.occurrence_assignments')
        .select('id')
        .where('employee_id', '=', employeeId)
        .where('status', '=', 'ACTIVE')
        .where('occurrence_id', '!=', o.id)
        .where('starts_at', '<', o.ends_at)
        .where('ends_at', '>', o.starts_at)
        .executeTakeFirst();
      if (overlap) reasons.push(`Another visit overlaps on ${o.scheduled_date}`);
    }
    const limit = await setting<number | null>(trx, 'max_visits_per_employee_day', null);
    if (limit !== null) {
      const n = await trx
        .selectFrom('app.occurrence_assignments as a')
        .innerJoin('app.service_occurrences as so', 'so.id', 'a.occurrence_id')
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .where('a.employee_id', '=', employeeId)
        .where('a.status', '=', 'ACTIVE')
        .where('so.scheduled_date', '=', o.scheduled_date)
        .executeTakeFirstOrThrow();
      if (Number(n.n) >= limit) reasons.push(`Daily work limit reached on ${o.scheduled_date}`);
    }
    return reasons;
  }

  // ------------------------------------------------------------------ needs & candidates

  async needs(actor: AdminActor, p: { communityId?: string | undefined; unassignedOnly: boolean }): Promise<AllocationNeed[]> {
    return this.tx(actor, async (trx) => {
      let q = trx
        .selectFrom('app.subscription_components as c')
        .innerJoin('app.subscriptions as s', 's.id', 'c.subscription_id')
        .innerJoin('app.services as sv', 'sv.id', 'c.service_id')
        .innerJoin('app.flats as f', 'f.id', 's.flat_id')
        .innerJoin('app.towers as t', 't.id', 'f.tower_id')
        .innerJoin('app.communities as co', 'co.id', 's.community_id')
        .innerJoin('app.resident_profiles as r', 'r.id', 's.resident_id')
        .leftJoin('app.standing_assignments as a', (j) => j.onRef('a.subscription_component_id', '=', 'c.id').on('a.status', '=', 'ACTIVE'))
        .leftJoin('app.employees as e', 'e.id', 'a.employee_id')
        .select([
          'c.id', 'c.subscription_id', 'c.service_id', 'sv.name as service_name', 'c.start_time', 'c.duration_minutes', 'c.days_of_week',
          's.period_start', 's.period_end', 'f.flat_number', 't.name as tower_name', 'co.name as community_name', 'r.full_name as resident_name',
          'a.id as assignment_id', 'a.effective_from', 'e.id as employee_id', 'e.employee_code', 'e.full_name as employee_name',
        ])
        .where('s.status', 'in', ['PENDING_ACTIVATION', 'ACTIVE'])
        .where('s.period_end', '>=', today());
      if (p.communityId) q = q.where('s.community_id', '=', p.communityId);
      if (p.unassignedOnly) q = q.where('a.id', 'is', null);
      const rows = await q.orderBy('s.period_start').orderBy('c.start_time').limit(500).execute();
      return rows.map((r) => ({
        componentId: r.id,
        subscriptionId: r.subscription_id,
        serviceId: r.service_id,
        serviceName: r.service_name,
        flat: { flatNumber: r.flat_number, towerName: r.tower_name, communityName: r.community_name },
        residentName: r.resident_name,
        startTime: r.start_time.slice(0, 5),
        durationMinutes: r.duration_minutes,
        daysOfWeek: r.days_of_week,
        periodStart: r.period_start,
        periodEnd: r.period_end,
        standing: r.assignment_id
          ? { assignmentId: r.assignment_id, employeeId: r.employee_id!, employeeCode: r.employee_code!, employeeName: r.employee_name!, effectiveFrom: r.effective_from! }
          : null,
      }));
    });
  }

  async candidates(actor: AdminActor, componentId: string): Promise<Candidates> {
    return this.tx(actor, async (trx) => {
      const c = await this.component(trx, actor, componentId);
      const employees = await trx
        .selectFrom('app.employees')
        .select(['id', 'employee_code', 'full_name'])
        .where('home_cluster_id', '=', c.clusterId ?? '00000000-0000-0000-0000-000000000000')
        .where('status', '=', 'ACTIVE')
        .orderBy('full_name')
        .execute();
      const upcoming = await this.upcoming(trx, c.id);
      const out: Candidates = { eligible: [], excluded: [] };
      for (const e of employees) {
        const { reasons, standingCount } = await this.standingReasons(trx, e.id, c, c.id);
        if (reasons.length) {
          out.excluded.push({ employeeId: e.id, employeeCode: e.employee_code, fullName: e.full_name, reasons });
          continue;
        }
        const conflicts: string[] = [];
        for (const o of upcoming) conflicts.push(...(await this.occurrenceReasons(trx, e.id, o)));
        out.eligible.push({ employeeId: e.id, employeeCode: e.employee_code, fullName: e.full_name, currentStandingCount: standingCount, conflicts: [...new Set(conflicts)] });
      }
      return out;
    });
  }

  private upcoming(trx: Tx, componentId: string, from = today()) {
    return trx
      .selectFrom('app.service_occurrences')
      .select(['id', 'scheduled_date', 'starts_at', 'ends_at', 'status'])
      .where('subscription_component_id', '=', componentId)
      .where('scheduled_date', '>=', from)
      .where('status', 'in', ['SCHEDULED', 'ASSIGNED'])
      .orderBy('scheduled_date')
      .execute();
  }

  // ------------------------------------------------------------------ standing assignment

  /**
   * Confirms (or permanently replaces) the standing employee for a service.
   * Future visits are assigned where the employee is free; date conflicts stay
   * unassigned and show as gaps for Operations.
   */
  async confirmStanding(actor: AdminActor, requestId: string, componentId: string, input: ConfirmStandingInput) {
    return this.tx(actor, async (trx) => {
      const c = await this.component(trx, actor, componentId);
      // Serialise allocation for this employee.
      await trx.selectFrom('app.employees').select('id').where('id', '=', input.employeeId).forUpdate().executeTakeFirst();
      const { reasons } = await this.standingReasons(trx, input.employeeId, c, c.id);
      if (reasons.length) throw businessRule(`This employee cannot be assigned: ${reasons.join('; ')}`);
      const from = input.effectiveFrom ?? (c.periodStart > today() ? c.periodStart : today());
      if (from > c.periodEnd) throw businessRule('The start date is after the subscription ends');

      const previous = await trx.selectFrom('app.standing_assignments').selectAll().where('subscription_component_id', '=', c.id).where('status', '=', 'ACTIVE').forUpdate().executeTakeFirst();
      if (previous) {
        if (previous.employee_id === input.employeeId) throw businessRule('This employee is already assigned');
        await trx
          .updateTable('app.standing_assignments')
          .set({ status: 'ENDED', effective_to: sql`greatest(${from}::date - 1, effective_from)`, end_reason: input.reason ?? 'Replaced' })
          .where('id', '=', previous.id)
          .execute();
      }
      const row = await trx
        .insertInto('app.standing_assignments')
        .values({ subscription_component_id: c.id, employee_id: input.employeeId, cluster_id: c.clusterId, effective_from: from, confirmed_by: actor.id })
        .returning('id')
        .executeTakeFirstOrThrow();

      await generateOccurrences(trx, { subscriptionId: c.subscriptionId });
      const upcoming = await this.upcoming(trx, c.id, from);
      let assigned = 0;
      const gaps: string[] = [];
      for (const o of upcoming) {
        const current = await trx.selectFrom('app.occurrence_assignments').selectAll().where('occurrence_id', '=', o.id).where('status', '=', 'ACTIVE').executeTakeFirst();
        if (current && current.source !== 'STANDING') continue; // keep manual/one-day replacements
        const r = await this.occurrenceReasons(trx, input.employeeId, o);
        if (current) await trx.updateTable('app.occurrence_assignments').set({ status: 'REPLACED' }).where('id', '=', current.id).execute();
        if (r.length) {
          gaps.push(...r);
          if (current) await trx.updateTable('app.service_occurrences').set({ status: 'SCHEDULED' }).where('id', '=', o.id).execute();
          continue;
        }
        await trx
          .insertInto('app.occurrence_assignments')
          .values({ occurrence_id: o.id, employee_id: input.employeeId, cluster_id: c.clusterId, source: 'STANDING', replaced_assignment_id: current?.id ?? null, starts_at: o.starts_at, ends_at: o.ends_at, assigned_by: actor.id })
          .execute();
        await trx.updateTable('app.service_occurrences').set({ status: 'ASSIGNED' }).where('id', '=', o.id).execute();
        assigned++;
      }
      // "Activated when operational start conditions are met": every component has a worker.
      await activateIfStaffed(trx, c.subscriptionId);
      await auditAdmin(trx, actor, requestId, {
        action: previous ? 'standing_assignment.replaced' : 'standing_assignment.confirmed',
        targetType: 'subscription_component',
        targetId: c.id,
        reason: input.reason ?? null,
        before: previous ? { employeeId: previous.employee_id } : undefined,
        after: { employeeId: input.employeeId, effectiveFrom: from, assignedVisits: assigned },
      });
      await trx
        .insertInto('app.notification_outbox')
        .values({ event_type: 'assignment.standing', dedupe_key: `standing:${row.id}`, channel: 'PUSH', recipient: input.employeeId, payload: JSON.stringify({ componentId: c.id, effectiveFrom: from }) })
        .execute();
      return { assignmentId: row.id, assignedVisits: assigned, gaps: [...new Set(gaps)] };
    });
  }

  // ------------------------------------------------------------------ occurrences

  async occurrences(actor: AdminActor, p: { communityId?: string | undefined; from: string; to: string; unassignedOnly: boolean }): Promise<Occurrence[]> {
    return this.tx(actor, async (trx) => {
      let q = trx
        .selectFrom('app.service_occurrences as o')
        .innerJoin('app.services as sv', 'sv.id', 'o.service_id')
        .innerJoin('app.flats as f', 'f.id', 'o.flat_id')
        .innerJoin('app.towers as t', 't.id', 'f.tower_id')
        .innerJoin('app.communities as co', 'co.id', 'o.community_id')
        .innerJoin('app.subscriptions as s', 's.id', 'o.subscription_id')
        .innerJoin('app.resident_profiles as r', 'r.id', 's.resident_id')
        .leftJoin('app.occurrence_assignments as a', (j) => j.onRef('a.occurrence_id', '=', 'o.id').on('a.status', '=', 'ACTIVE'))
        .leftJoin('app.employees as e', 'e.id', 'a.employee_id')
        .select([
          'o.id', 'o.scheduled_date', 'o.visit_no', 'o.starts_at', 'o.ends_at', 'o.status', 'sv.name as service_name', 'f.flat_number', 't.name as tower_name',
          'co.name as community_name', 'r.full_name as resident_name', 'a.id as assignment_id', 'a.source', 'e.id as employee_id', 'e.employee_code', 'e.full_name as employee_name',
        ])
        .where('o.scheduled_date', '>=', p.from)
        .where('o.scheduled_date', '<=', p.to)
        .where('o.status', '!=', 'CANCELLED');
      if (p.communityId) q = q.where('o.community_id', '=', p.communityId);
      if (p.unassignedOnly) q = q.where('a.id', 'is', null);
      const rows = await q.orderBy('o.scheduled_date').orderBy('o.starts_at').limit(1000).execute();
      return rows.map((r) => ({
        id: r.id,
        scheduledDate: r.scheduled_date,
        visitNo: r.visit_no,
        startsAt: iso(r.starts_at),
        endsAt: iso(r.ends_at),
        status: r.status,
        serviceName: r.service_name,
        flat: { flatNumber: r.flat_number, towerName: r.tower_name, communityName: r.community_name },
        residentName: r.resident_name,
        assignment: r.assignment_id ? { id: r.assignment_id, employeeId: r.employee_id!, employeeCode: r.employee_code!, employeeName: r.employee_name!, source: r.source! } : null,
      }));
    });
  }

  async occurrenceCandidates(actor: AdminActor, occurrenceId: string): Promise<Candidates> {
    return this.tx(actor, async (trx) => {
      const o = await this.scopedOccurrence(trx, actor, occurrenceId);
      const employees = await trx
        .selectFrom('app.employees')
        .select(['id', 'employee_code', 'full_name'])
        .where('home_cluster_id', '=', o.cluster_id ?? '00000000-0000-0000-0000-000000000000')
        .where('status', '=', 'ACTIVE')
        .orderBy('full_name')
        .execute();
      const out: Candidates = { eligible: [], excluded: [] };
      for (const e of employees) {
        const reasons = [...(await this.employeeBasics(trx, e.id, o.service_id, o.cluster_id)), ...(await this.occurrenceReasons(trx, e.id, o))];
        if (reasons.length) out.excluded.push({ employeeId: e.id, employeeCode: e.employee_code, fullName: e.full_name, reasons });
        else out.eligible.push({ employeeId: e.id, employeeCode: e.employee_code, fullName: e.full_name, currentStandingCount: 0, conflicts: [] });
      }
      return out;
    });
  }

  private async employeeBasics(trx: Tx, employeeId: string, serviceId: string, clusterId: string | null) {
    const e = await trx.selectFrom('app.employees').select(['status', 'readiness', 'home_cluster_id']).where('id', '=', employeeId).executeTakeFirst();
    const reasons: string[] = [];
    if (!e) return ['Employee not found'];
    if (e.status !== 'ACTIVE') reasons.push('Not active');
    if (e.readiness !== 'READY') reasons.push('Not deployment-ready');
    if (e.home_cluster_id !== clusterId) reasons.push('Outside the authorised cluster');
    const q = await trx.selectFrom('app.employee_qualifications').select('service_id').where('employee_id', '=', employeeId).where('service_id', '=', serviceId).executeTakeFirst();
    if (!q) reasons.push('Not qualified for this service');
    return reasons;
  }

  private async scopedOccurrence(trx: Tx, actor: AdminActor, id: string) {
    const o = await trx.selectFrom('app.service_occurrences').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
    if (!o || !inScope(actor, o.cluster_id)) throw notFound('Visit');
    return o;
  }

  /** One-day replacement or manual assignment of a single visit (ADM-11). */
  async assignOccurrence(actor: AdminActor, requestId: string, occurrenceId: string, input: { employeeId: string; reason: string }) {
    return this.tx(actor, async (trx) => {
      const o = await this.scopedOccurrence(trx, actor, occurrenceId);
      if (!['SCHEDULED', 'ASSIGNED'].includes(o.status)) throw businessRule('Only an upcoming visit can be reassigned');
      if (o.scheduled_date < today()) throw businessRule('Past visits cannot be reassigned');
      if (!o.starts_at) throw businessRule('Set the visit time before assigning it');
      await trx.selectFrom('app.employees').select('id').where('id', '=', input.employeeId).forUpdate().executeTakeFirst();
      const reasons = [...(await this.employeeBasics(trx, input.employeeId, o.service_id, o.cluster_id)), ...(await this.occurrenceReasons(trx, input.employeeId, o))];
      if (reasons.length) throw businessRule(`This employee cannot take the visit: ${reasons.join('; ')}`);
      const current = await trx.selectFrom('app.occurrence_assignments').selectAll().where('occurrence_id', '=', o.id).where('status', '=', 'ACTIVE').executeTakeFirst();
      if (current?.employee_id === input.employeeId) throw businessRule('This employee is already assigned to the visit');
      if (current) await trx.updateTable('app.occurrence_assignments').set({ status: 'REPLACED' }).where('id', '=', current.id).execute();
      await trx
        .insertInto('app.occurrence_assignments')
        .values({
          occurrence_id: o.id,
          employee_id: input.employeeId,
          cluster_id: o.cluster_id,
          source: current ? 'REPLACEMENT' : 'MANUAL',
          replaced_assignment_id: current?.id ?? null,
          starts_at: o.starts_at,
          ends_at: o.ends_at,
          assigned_by: actor.id,
          reason: input.reason,
        })
        .execute();
      await trx.updateTable('app.service_occurrences').set({ status: 'ASSIGNED' }).where('id', '=', o.id).execute();
      await auditAdmin(trx, actor, requestId, {
        action: current ? 'occurrence.replaced' : 'occurrence.assigned',
        targetType: 'service_occurrence',
        targetId: o.id,
        reason: input.reason,
        before: current ? { employeeId: current.employee_id } : undefined,
        after: { employeeId: input.employeeId },
      });
      await trx
        .insertInto('app.notification_outbox')
        .values({ event_type: 'assignment.visit', dedupe_key: `visit:${o.id}:${input.employeeId}:${Date.now()}`, channel: 'PUSH', recipient: input.employeeId, payload: JSON.stringify({ occurrenceId: o.id }) })
        .execute();
      return { status: 'ASSIGNED' as const };
    });
  }

  /** Periodic: generate the rolling horizon and fill it from standing assignments. */
  async maintain(): Promise<{ generated: number; assigned: number }> {
    const generated = await withTx(this.db, SYSTEM_CLAIMS, (trx) => generateOccurrences(trx, {}));
    const pending = await withTx(this.db, SYSTEM_CLAIMS, (trx) =>
      trx
        .selectFrom('app.service_occurrences as o')
        .innerJoin('app.standing_assignments as a', (j) =>
          j.onRef('a.subscription_component_id', '=', 'o.subscription_component_id').on('a.status', '=', 'ACTIVE'),
        )
        .leftJoin('app.occurrence_assignments as oa', (j) => j.onRef('oa.occurrence_id', '=', 'o.id').on('oa.status', '=', 'ACTIVE'))
        .select(['o.id', 'o.scheduled_date', 'o.starts_at', 'o.ends_at', 'o.cluster_id', 'a.employee_id', 'a.effective_from'])
        .where('o.status', '=', 'SCHEDULED')
        .where('oa.id', 'is', null)
        .where('o.starts_at', 'is not', null)
        .where('o.scheduled_date', '>=', today())
        .whereRef('o.scheduled_date', '>=', 'a.effective_from')
        .limit(500)
        .execute(),
    );
    let assigned = 0;
    for (const o of pending) {
      try {
        await withTx(this.db, SYSTEM_CLAIMS, async (trx) => {
          // Skip visits released for leave/replacement on purpose (an earlier assignment exists).
          const history = await trx.selectFrom('app.occurrence_assignments').select('id').where('occurrence_id', '=', o.id).executeTakeFirst();
          if (history) return;
          if ((await this.occurrenceReasons(trx, o.employee_id, o)).length) return;
          await trx
            .insertInto('app.occurrence_assignments')
            .values({ occurrence_id: o.id, employee_id: o.employee_id, cluster_id: o.cluster_id, source: 'STANDING', starts_at: o.starts_at, ends_at: o.ends_at })
            .execute();
          await trx.updateTable('app.service_occurrences').set({ status: 'ASSIGNED' }).where('id', '=', o.id).execute();
          assigned++;
        });
      } catch (err) {
        this.logger?.warn({ err, occurrenceId: o.id }, 'standing auto-assignment skipped');
      }
    }
    return { generated, assigned };
  }
}

/**
 * Rolling generation (ADR-005, horizon setting, default 14 days). Visit 1 starts
 * at the slot time in the community's timezone; further visits per day are
 * created without a time (OPEN: Operations sets it). Idempotent.
 */
export async function generateOccurrences(trx: Tx, f: { subscriptionId?: string }): Promise<number> {
  const horizon = await setting<number>(trx, 'occurrence_horizon_days', 14);
  const res = await sql<{ id: string }>`
    insert into app.service_occurrences
      (subscription_component_id, subscription_id, service_id, flat_id, community_id, cluster_id, scheduled_date, visit_no, starts_at, ends_at)
    select c.id, s.id, c.service_id, s.flat_id, s.community_id, s.cluster_id, d::date, v.n,
           case when v.n = 1 then ((d::date + c.start_time) at time zone co.timezone) end,
           case when v.n = 1 then ((d::date + c.start_time) at time zone co.timezone) + make_interval(mins => c.duration_minutes) end
      from app.subscription_components c
      join app.subscriptions s on s.id = c.subscription_id
      join app.communities co on co.id = s.community_id
      cross join lateral generate_series(greatest(s.period_start, current_date), least(s.period_end, current_date + ${horizon}::int), interval '1 day') d
      cross join lateral generate_series(1, c.visits_per_day) v(n)
     where s.status in ('PENDING_ACTIVATION', 'ACTIVE')
       and (c.days_of_week & (1 << (extract(isodow from d)::int - 1))) <> 0
       ${f.subscriptionId ? sql`and s.id = ${f.subscriptionId}` : sql``}
    on conflict (subscription_component_id, scheduled_date, visit_no) do nothing
    returning id
  `.execute(trx);
  return res.rows.length;
}

/** A subscription becomes ACTIVE once every component has a standing worker. */
export async function activateIfStaffed(trx: Tx, subscriptionId: string) {
  const missing = await trx
    .selectFrom('app.subscription_components as c')
    .leftJoin('app.standing_assignments as a', (j) => j.onRef('a.subscription_component_id', '=', 'c.id').on('a.status', '=', 'ACTIVE'))
    .select('c.id')
    .where('c.subscription_id', '=', subscriptionId)
    .where('a.id', 'is', null)
    .executeTakeFirst();
  if (!missing) {
    await trx.updateTable('app.subscriptions').set({ status: 'ACTIVE' }).where('id', '=', subscriptionId).where('status', '=', 'PENDING_ACTIVATION').execute();
  }
}
