import { sql } from 'kysely';
import type {
  AddLineItemInput,
  Compensation,
  FinanceSummary,
  PayrollLine,
  PayrollRunDetail,
  PayrollRunSummary,
  Payslip,
  RecordSalaryPaymentInput,
  SetCompensationInput,
} from '@nestovin/contracts';
import type { Database, Tx } from '../../db/database';
import { withTx } from '../../db/database';
import { inScope, toDbClaims, type AdminActor } from '../../auth/permissions';
import { businessRule, conflict, forbidden, notFound } from '../../lib/errors';
import { auditAdmin } from '../audit/audit';
import { employeeClaims, type EmployeeActor } from '../workforce/employee-service';
import { notify } from '../notifications/service';
import { businessToday } from '../../lib/dates';

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());
const dayMs = 86_400_000;
const toDay = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
const fmt = (t: number) => new Date(t).toISOString().slice(0, 10);

export function monthBounds(month: string): { start: string; end: string; days: number } {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(days).padStart(2, '0')}`, days };
}

/**
 * ADR-014: fixed monthly salary prorated by calendar days. Each salary segment
 * contributes rate × days; the total is divided by the days in the month and
 * rounded half up once (integer paise).
 */
export function prorate(
  month: string,
  segments: { monthlyAmountPaise: number; from: string; to: string | null }[],
  employment: { from: string | null; to: string | null },
): { segments: { monthlyAmountPaise: number; from: string; to: string; days: number }[]; payableDays: number; basePaise: number; daysInMonth: number } {
  const { start, end, days } = monthBounds(month);
  const lo = Math.max(toDay(start), employment.from ? toDay(employment.from) : -Infinity);
  const hi = Math.min(toDay(end), employment.to ? toDay(employment.to) : Infinity);
  const used: { monthlyAmountPaise: number; from: string; to: string; days: number }[] = [];
  let weighted = 0;
  let payable = 0;
  for (const s of segments) {
    const a = Math.max(lo, toDay(s.from));
    const b = Math.min(hi, s.to ? toDay(s.to) : Infinity);
    if (b < a) continue;
    const n = Math.round((b - a) / dayMs) + 1;
    used.push({ monthlyAmountPaise: s.monthlyAmountPaise, from: fmt(a), to: fmt(b), days: n });
    weighted += s.monthlyAmountPaise * n;
    payable += n;
  }
  // round_half_up(weighted / days) in integers
  const basePaise = Math.floor((weighted * 2 + days) / (2 * days));
  return { segments: used, payableDays: payable, basePaise, daysInMonth: days };
}

/** ADM-14 payroll + finance overview. Payroll actions need global scope (one common cycle). */
export class PayrollService {
  constructor(private readonly db: Database) {}

  private tx<T>(actor: AdminActor, fn: (trx: Tx) => Promise<T>) {
    return withTx(this.db, toDbClaims(actor), fn);
  }

  private requireGlobal(actor: AdminActor) {
    if (!actor.isSuperAdmin && actor.scope.type !== 'GLOBAL') throw forbidden('Payroll is run for all clusters; it needs an admin with access to all clusters');
  }

  // ------------------------------------------------------------------ compensation

  async compensation(actor: AdminActor, employeeId: string): Promise<Compensation[]> {
    return this.tx(actor, async (trx) => {
      const e = await trx.selectFrom('app.employees').select('home_cluster_id').where('id', '=', employeeId).executeTakeFirst();
      if (!e || !inScope(actor, e.home_cluster_id)) throw notFound('Employee');
      const rows = await trx.selectFrom('app.compensation_profiles').selectAll().where('employee_id', '=', employeeId).orderBy('effective_from', 'desc').execute();
      return rows.map((r) => ({ id: r.id, type: 'FIXED_MONTHLY' as const, monthlyAmountPaise: Number(r.monthly_amount_paise), effectiveFrom: r.effective_from, effectiveTo: r.effective_to, createdAt: iso(r.created_at)! }));
    });
  }

  /** New salary from a date; the previous open profile ends the day before (history kept). */
  async setCompensation(actor: AdminActor, requestId: string, employeeId: string, input: SetCompensationInput): Promise<Compensation[]> {
    await this.tx(actor, async (trx) => {
      const e = await trx.selectFrom('app.employees').select(['home_cluster_id', 'status']).where('id', '=', employeeId).forUpdate().executeTakeFirst();
      if (!e || !inScope(actor, e.home_cluster_id)) throw notFound('Employee');
      const later = await trx.selectFrom('app.compensation_profiles').select('id').where('employee_id', '=', employeeId).where('effective_from', '>=', input.effectiveFrom).executeTakeFirst();
      if (later) throw businessRule('A salary already starts on or after this date. Choose a later date.');
      const approvedRun = await sql<{ month: string }>`
        select to_char(p.month, 'YYYY-MM') as month from app.payroll_runs r join app.payroll_periods p on p.id = r.period_id
          join app.payroll_lines l on l.run_id = r.id and l.employee_id = ${employeeId}
         where r.status = 'APPROVED' and p.month + interval '1 month' > ${input.effectiveFrom}::date limit 1`.execute(trx);
      if (approvedRun.rows[0]) throw businessRule(`Payroll for ${approvedRun.rows[0].month} is already approved; the new salary must start after that month`);
      await trx
        .updateTable('app.compensation_profiles')
        .set({ effective_to: sql`${input.effectiveFrom}::date - 1` })
        .where('employee_id', '=', employeeId)
        .where('effective_to', 'is', null)
        .execute();
      await trx
        .insertInto('app.compensation_profiles')
        .values({ employee_id: employeeId, cluster_id: e.home_cluster_id, monthly_amount_paise: input.monthlyAmountPaise, effective_from: input.effectiveFrom, approved_by: actor.id })
        .execute();
      await auditAdmin(trx, actor, requestId, { action: 'compensation.set', targetType: 'employee', targetId: employeeId, after: input });
    });
    return this.compensation(actor, employeeId);
  }

  // ------------------------------------------------------------------ runs

  async runs(actor: AdminActor): Promise<PayrollRunSummary[]> {
    return this.tx(actor, async (trx) => {
      const rows = await trx
        .selectFrom('app.payroll_runs as r')
        .innerJoin('app.payroll_periods as p', 'p.id', 'r.period_id')
        .selectAll('r')
        .select(sql<string>`to_char(p.month, 'YYYY-MM')`.as('month'))
        .orderBy('p.month', 'desc')
        .orderBy('r.version', 'desc')
        .limit(60)
        .execute();
      const out: PayrollRunSummary[] = [];
      for (const r of rows) out.push(await this.summary(trx, r));
      return out;
    });
  }

  private async summary(trx: Tx, r: { id: string; month: string; version: number; status: PayrollRunSummary['status']; created_at: Date; reviewed_at: Date | null; return_reason: string | null }): Promise<PayrollRunSummary> {
    const agg = await trx
      .selectFrom('app.payroll_lines as l')
      .select((eb) => [
        eb.fn.countAll<string>().as('n'),
        eb.fn.coalesce(eb.fn.sum<string>('l.net_paise'), sql<string>`0`).as('net'),
        sql<string>`count(*) filter (where cardinality(l.flags) > 0)`.as('flagged'),
      ])
      .where('l.run_id', '=', r.id)
      .executeTakeFirstOrThrow();
    const paid = await trx
      .selectFrom('app.salary_payments as s')
      .innerJoin('app.payroll_lines as l', 'l.id', 's.line_id')
      .select((eb) => eb.fn.coalesce(eb.fn.sum<string>('s.amount_paise'), sql<string>`0`).as('paid'))
      .where('l.run_id', '=', r.id)
      .executeTakeFirstOrThrow();
    return {
      id: r.id,
      month: r.month,
      version: r.version,
      status: r.status,
      employees: Number(agg.n),
      flagged: Number(agg.flagged),
      netPaise: Number(agg.net),
      paidPaise: Number(paid.paid),
      preparedAt: iso(r.created_at)!,
      reviewedAt: iso(r.reviewed_at),
      returnReason: r.return_reason,
    };
  }

  /** Prepares a new run version for a month from approved source records. */
  async createRun(actor: AdminActor, requestId: string, month: string): Promise<PayrollRunDetail> {
    this.requireGlobal(actor);
    const runId = await this.tx(actor, async (trx) => {
      const { start, end } = monthBounds(month);
      if (start > businessToday()) throw businessRule('Payroll can be prepared once the month has started');
      const period =
        (await trx.selectFrom('app.payroll_periods').select('id').where('month', '=', start).executeTakeFirst()) ??
        (await trx.insertInto('app.payroll_periods').values({ month: start }).returning('id').executeTakeFirstOrThrow());
      const existing = await trx.selectFrom('app.payroll_runs').select(['status', 'version']).where('period_id', '=', period.id).orderBy('version', 'desc').execute();
      if (existing.some((r) => r.status === 'APPROVED')) throw businessRule('Payroll for this month is already approved');
      if (existing.some((r) => r.status === 'DRAFT' || r.status === 'IN_REVIEW')) throw conflict('A payroll run for this month is already open');
      const run = await trx
        .insertInto('app.payroll_runs')
        .values({ period_id: period.id, version: (existing[0]?.version ?? 0) + 1, prepared_by: actor.id })
        .returning('id')
        .executeTakeFirstOrThrow();

      // Everyone employed at any point in the month.
      const employees = await trx
        .selectFrom('app.employees')
        .select(['id', 'home_cluster_id', 'joined_on', 'exited_on', 'status'])
        .where((eb) => eb.or([eb('joined_on', 'is', null), eb('joined_on', '<=', end)]))
        .where((eb) => eb.or([eb('exited_on', 'is', null), eb('exited_on', '>=', start)]))
        .where((eb) => eb.or([eb('status', '!=', 'EXITED'), eb('exited_on', 'is not', null)]))
        .execute();
      for (const e of employees) await this.buildLine(trx, run.id, month, e);
      await auditAdmin(trx, actor, requestId, { action: 'payroll.prepared', targetType: 'payroll_run', targetId: run.id, after: { month, employees: employees.length } });
      return run.id;
    });
    return this.detail(actor, runId);
  }

  private async buildLine(trx: Tx, runId: string, month: string, e: { id: string; home_cluster_id: string; joined_on: string | null; exited_on: string | null }) {
    const { start, end } = monthBounds(month);
    const profiles = await trx
      .selectFrom('app.compensation_profiles')
      .select(['monthly_amount_paise', 'effective_from', 'effective_to'])
      .where('employee_id', '=', e.id)
      .where('effective_from', '<=', end)
      .where((eb) => eb.or([eb('effective_to', 'is', null), eb('effective_to', '>=', start)]))
      .orderBy('effective_from')
      .execute();
    const calc = prorate(month, profiles.map((p) => ({ monthlyAmountPaise: Number(p.monthly_amount_paise), from: p.effective_from, to: p.effective_to })), { from: e.joined_on, to: e.exited_on });

    // Inputs from approved records only (ADM-14). No formula applies to them yet.
    const att = await sql<{ completed: string; worker_ns: string; resident_ns: string; corrections: string; overtime: string }>`
      select
        (select count(*) from app.service_completions c join app.service_occurrences o on o.id = c.occurrence_id
          where c.employee_id = ${e.id} and o.scheduled_date between ${start}::date and ${end}::date) as completed,
        (select count(*) from app.no_show_records n join app.service_occurrences o on o.id = n.occurrence_id
          where n.employee_id = ${e.id} and n.kind = 'WORKER_ABSENT' and o.scheduled_date between ${start}::date and ${end}::date) as worker_ns,
        (select count(*) from app.no_show_records n join app.service_occurrences o on o.id = n.occurrence_id
          where n.employee_id = ${e.id} and n.kind = 'RESIDENT_ABSENT' and o.scheduled_date between ${start}::date and ${end}::date) as resident_ns,
        (select count(*) from app.attendance_corrections k join app.service_occurrences o on o.id = k.occurrence_id
          where k.employee_id = ${e.id} and k.status = 'PENDING' and o.scheduled_date between ${start}::date and ${end}::date) as corrections,
        (select count(*) from app.service_completions c join app.occurrence_assignments a on a.occurrence_id = c.occurrence_id and a.status = 'ACTIVE' and a.source = 'OVERTIME'
           join app.service_occurrences o on o.id = c.occurrence_id
          where c.employee_id = ${e.id} and o.scheduled_date between ${start}::date and ${end}::date) as overtime
    `.execute(trx);
    const leave = await sql<{ days: string }>`
      select coalesce(sum(least(end_date, ${end}::date) - greatest(start_date, ${start}::date) + 1), 0) as days
        from app.leave_requests where employee_id = ${e.id} and status = 'APPROVED' and start_date <= ${end}::date and end_date >= ${start}::date
    `.execute(trx);
    const a = att.rows[0]!;
    const summary = {
      completedVisits: Number(a.completed),
      workerNoShows: Number(a.worker_ns),
      residentNoShows: Number(a.resident_ns),
      approvedLeaveDays: Number(leave.rows[0]?.days ?? 0),
      pendingCorrections: Number(a.corrections),
      overtimeVisits: Number(a.overtime),
    };
    const flags: string[] = [];
    if (calc.segments.length === 0) flags.push('NO_SALARY_SET');
    else if (calc.payableDays < calc.daysInMonth) flags.push('PRORATED');
    if (summary.workerNoShows) flags.push('WORKER_NO_SHOWS_NO_RULE');
    if (summary.approvedLeaveDays) flags.push('LEAVE_NO_RULE');
    if (summary.pendingCorrections) flags.push('PENDING_CORRECTIONS');
    if (summary.overtimeVisits) flags.push('OVERTIME_NO_RATE');

    const line = await trx
      .insertInto('app.payroll_lines')
      .values({
        run_id: runId,
        employee_id: e.id,
        cluster_id: e.home_cluster_id,
        compensation_snapshot: JSON.stringify(calc.segments),
        days_in_month: calc.daysInMonth,
        payable_days: calc.payableDays,
        attendance_summary: JSON.stringify(summary),
        flags,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    if (calc.basePaise > 0) {
      await trx
        .insertInto('app.payroll_line_items')
        .values({ line_id: line.id, cluster_id: e.home_cluster_id, kind: 'EARNING', component: 'BASE_SALARY', amount_paise: calc.basePaise, source_type: 'CALCULATED' })
        .execute();
    }
    await this.recalcLine(trx, line.id);
  }

  private async recalcLine(trx: Tx, lineId: string) {
    const t = await trx
      .selectFrom('app.payroll_line_items')
      .select([
        sql<string>`coalesce(sum(amount_paise) filter (where kind = 'EARNING'), 0)`.as('earn'),
        sql<string>`coalesce(sum(amount_paise) filter (where kind = 'DEDUCTION'), 0)`.as('ded'),
      ])
      .where('line_id', '=', lineId)
      .executeTakeFirstOrThrow();
    const earn = Number(t.earn);
    const ded = Number(t.ded);
    if (ded > earn) throw businessRule('Deductions cannot be more than the earnings for the month');
    await trx.updateTable('app.payroll_lines').set({ earnings_paise: earn, deductions_paise: ded, net_paise: earn - ded }).where('id', '=', lineId).execute();
  }

  async detail(actor: AdminActor, runId: string): Promise<PayrollRunDetail> {
    return this.tx(actor, async (trx) => {
      const r = await trx
        .selectFrom('app.payroll_runs as r')
        .innerJoin('app.payroll_periods as p', 'p.id', 'r.period_id')
        .selectAll('r')
        .select(sql<string>`to_char(p.month, 'YYYY-MM')`.as('month'))
        .where('r.id', '=', runId)
        .executeTakeFirst();
      if (!r) throw notFound('Payroll run');
      return { ...(await this.summary(trx, r)), lines: await this.lines(trx, { runId }) };
    });
  }

  private async lines(trx: Tx, f: { runId?: string; lineId?: string; employeeId?: string }): Promise<PayrollLine[]> {
    let q = trx
      .selectFrom('app.payroll_lines as l')
      .innerJoin('app.employees as e', 'e.id', 'l.employee_id')
      .selectAll('l')
      .select(['e.employee_code', 'e.full_name']);
    if (f.runId) q = q.where('l.run_id', '=', f.runId);
    if (f.lineId) q = q.where('l.id', '=', f.lineId);
    const rows = await q.orderBy('e.employee_code').execute();
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const items = await trx.selectFrom('app.payroll_line_items').selectAll().where('line_id', 'in', ids).orderBy('created_at').execute();
    const pays = await trx.selectFrom('app.salary_payments').selectAll().where('line_id', 'in', ids).orderBy('created_at').execute();
    return rows.map((l) => {
      const p = pays.filter((x) => x.line_id === l.id);
      const paid = p.reduce((s, x) => s + Number(x.amount_paise), 0);
      const net = Number(l.net_paise);
      return {
        id: l.id,
        employee: { id: l.employee_id, employeeCode: l.employee_code, fullName: l.full_name },
        daysInMonth: l.days_in_month,
        payableDays: l.payable_days,
        compensation: (l.compensation_snapshot as PayrollLine['compensation']) ?? [],
        attendance: l.attendance_summary as PayrollLine['attendance'],
        items: items
          .filter((i) => i.line_id === l.id)
          .map((i) => ({ id: i.id, kind: i.kind, component: i.component, amountPaise: Number(i.amount_paise), sourceType: i.source_type, note: i.note })),
        earningsPaise: Number(l.earnings_paise),
        deductionsPaise: Number(l.deductions_paise),
        netPaise: net,
        flags: l.flags,
        paidPaise: paid,
        paymentStatus: net <= 0 ? 'NOT_PAYABLE' : paid <= 0 ? 'PENDING' : paid < net ? 'PARTIALLY_PAID' : 'PAID',
        payments: p.map((x) => ({ id: x.id, amountPaise: Number(x.amount_paise), paidOn: x.paid_on, method: x.method, reference: x.reference, reversesPaymentId: x.reverses_payment_id, note: x.note })),
      };
    });
  }

  private async runOf(trx: Tx, runId: string) {
    const r = await trx.selectFrom('app.payroll_runs').selectAll().where('id', '=', runId).forUpdate().executeTakeFirst();
    if (!r) throw notFound('Payroll run');
    return r;
  }

  private async lineInRun(trx: Tx, lineId: string) {
    const l = await trx
      .selectFrom('app.payroll_lines as l')
      .innerJoin('app.payroll_runs as r', 'r.id', 'l.run_id')
      .select(['l.id', 'l.run_id', 'l.cluster_id', 'l.employee_id', 'l.net_paise', 'r.status as run_status'])
      .where('l.id', '=', lineId)
      .forUpdate('l')
      .executeTakeFirst();
    if (!l) throw notFound('Payroll line');
    return l;
  }

  /** Authorised manual earning/deduction with a reason (only while the run is a draft). */
  async addItem(actor: AdminActor, requestId: string, lineId: string, input: AddLineItemInput): Promise<PayrollLine> {
    this.requireGlobal(actor);
    return this.tx(actor, async (trx) => {
      const l = await this.lineInRun(trx, lineId);
      if (l.run_status !== 'DRAFT') throw businessRule('Entries can be changed only while the payroll is a draft');
      const deduction = input.component === 'ABSENCE_DEDUCTION' || input.component === 'OTHER_DEDUCTION';
      if (deduction !== (input.kind === 'DEDUCTION')) throw businessRule('This component does not match the entry type');
      await trx
        .insertInto('app.payroll_line_items')
        .values({ line_id: l.id, cluster_id: l.cluster_id, kind: input.kind, component: input.component, amount_paise: input.amountPaise, source_type: 'AUTHORISED_ENTRY', note: input.note, created_by: actor.id })
        .execute();
      await this.recalcLine(trx, l.id);
      await auditAdmin(trx, actor, requestId, { action: 'payroll.entry_added', targetType: 'payroll_line', targetId: l.id, reason: input.note, after: input });
      return (await this.lines(trx, { lineId: l.id }))[0]!;
    });
  }

  async removeItem(actor: AdminActor, requestId: string, itemId: string): Promise<PayrollLine> {
    this.requireGlobal(actor);
    return this.tx(actor, async (trx) => {
      const item = await trx.selectFrom('app.payroll_line_items').selectAll().where('id', '=', itemId).executeTakeFirst();
      if (!item) throw notFound('Entry');
      if (item.source_type !== 'AUTHORISED_ENTRY') throw businessRule('Calculated amounts cannot be removed');
      const l = await this.lineInRun(trx, item.line_id);
      if (l.run_status !== 'DRAFT') throw businessRule('Entries can be changed only while the payroll is a draft');
      await trx.deleteFrom('app.payroll_line_items').where('id', '=', itemId).execute();
      await this.recalcLine(trx, l.id);
      await auditAdmin(trx, actor, requestId, { action: 'payroll.entry_removed', targetType: 'payroll_line', targetId: l.id, before: { component: item.component, amount: item.amount_paise, note: item.note } });
      return (await this.lines(trx, { lineId: l.id }))[0]!;
    });
  }

  async submit(actor: AdminActor, requestId: string, runId: string) {
    this.requireGlobal(actor);
    await this.tx(actor, async (trx) => {
      const r = await this.runOf(trx, runId);
      if (r.status !== 'DRAFT') throw businessRule('Only a draft payroll can be sent for review');
      await trx.updateTable('app.payroll_runs').set({ status: 'IN_REVIEW', submitted_at: sql`now()`, updated_at: sql`now()` }).where('id', '=', runId).execute();
      await auditAdmin(trx, actor, requestId, { action: 'payroll.submitted', targetType: 'payroll_run', targetId: runId });
    });
    return this.detail(actor, runId);
  }

  /** Approval stores the version; it never marks anything paid (ADM-14). Preparer/approver separation: OPEN. */
  async approve(actor: AdminActor, requestId: string, runId: string) {
    this.requireGlobal(actor);
    await this.tx(actor, async (trx) => {
      const r = await this.runOf(trx, runId);
      if (r.status !== 'IN_REVIEW') throw businessRule('Only a payroll in review can be approved');
      await trx.updateTable('app.payroll_runs').set({ status: 'APPROVED', reviewed_by: actor.id, reviewed_at: sql`now()`, updated_at: sql`now()` }).where('id', '=', runId).execute();
      await auditAdmin(trx, actor, requestId, { action: 'payroll.approved', targetType: 'payroll_run', targetId: runId });
      const paid = await trx.selectFrom('app.payroll_lines').select('employee_id').where('run_id', '=', runId).where('net_paise', '>', '0').execute();
      for (const l of paid) await notify(trx, 'payslip.available', l.employee_id, { runId }, `payslip:${runId}:${l.employee_id}`);
    });
    return this.detail(actor, runId);
  }

  /** Returned runs are kept as history; preparing again creates the next version. */
  async returnRun(actor: AdminActor, requestId: string, runId: string, reason: string) {
    this.requireGlobal(actor);
    await this.tx(actor, async (trx) => {
      const r = await this.runOf(trx, runId);
      if (r.status !== 'IN_REVIEW') throw businessRule('Only a payroll in review can be returned');
      await trx.updateTable('app.payroll_runs').set({ status: 'RETURNED', reviewed_by: actor.id, reviewed_at: sql`now()`, return_reason: reason, updated_at: sql`now()` }).where('id', '=', runId).execute();
      await auditAdmin(trx, actor, requestId, { action: 'payroll.returned', targetType: 'payroll_run', targetId: runId, reason });
    });
    return this.detail(actor, runId);
  }

  // ------------------------------------------------------------------ salary payments

  /** Record a transfer made outside Nestovin; creates exactly one linked salary expense. */
  async recordPayment(actor: AdminActor, requestId: string, lineId: string, input: RecordSalaryPaymentInput): Promise<PayrollLine> {
    this.requireGlobal(actor);
    return this.tx(actor, async (trx) => {
      const l = await this.lineInRun(trx, lineId);
      if (l.run_status !== 'APPROVED') throw businessRule('Record payments after the payroll is approved');
      if (input.paidOn > businessToday()) throw businessRule('The payment date cannot be in the future');
      const paid = await trx.selectFrom('app.salary_payments').select((eb) => eb.fn.coalesce(eb.fn.sum<string>('amount_paise'), sql<string>`0`).as('paid')).where('line_id', '=', l.id).executeTakeFirstOrThrow();
      const outstanding = Number(l.net_paise) - Number(paid.paid);
      if (input.amountPaise > outstanding) throw businessRule(`Only ${outstanding / 100} is outstanding for this employee`);
      let payment;
      try {
        payment = await trx
          .insertInto('app.salary_payments')
          .values({ line_id: l.id, employee_id: l.employee_id, cluster_id: l.cluster_id, amount_paise: input.amountPaise, paid_on: input.paidOn, method: input.method, reference: input.reference ?? null, note: input.note ?? null, recorded_by: actor.id })
          .returning('id')
          .executeTakeFirstOrThrow();
      } catch (err) {
        if ((err as { code?: string }).code === '23505') throw conflict('This payment reference is already recorded. Check for a duplicate before recording again.', [{ path: 'reference', message: 'Already recorded' }]);
        throw err;
      }
      await trx
        .insertInto('app.expense_entries')
        .values({ cluster_id: l.cluster_id, amount_paise: input.amountPaise, entry_date: input.paidOn, salary_payment_id: payment.id, description: 'Salary payment', created_by: actor.id })
        .execute();
      await auditAdmin(trx, actor, requestId, { action: 'salary.payment_recorded', targetType: 'payroll_line', targetId: l.id, after: { ...input, paymentId: payment.id } });
      return (await this.lines(trx, { lineId: l.id }))[0]!;
    });
  }

  /** A wrong record is reversed (negative payment + negative expense), never edited. */
  async reversePayment(actor: AdminActor, requestId: string, paymentId: string, reason: string): Promise<PayrollLine> {
    this.requireGlobal(actor);
    return this.tx(actor, async (trx) => {
      // No row lock: payments are append-only (no UPDATE right); the unique reverses_payment_id stops a double reversal.
      const p = await trx.selectFrom('app.salary_payments').selectAll().where('id', '=', paymentId).executeTakeFirst();
      if (!p) throw notFound('Payment');
      if (p.reverses_payment_id) throw businessRule('A reversal cannot be reversed');
      const done = await trx.selectFrom('app.salary_payments').select('id').where('reverses_payment_id', '=', p.id).executeTakeFirst();
      if (done) throw businessRule('This payment is already reversed');
      const today = businessToday();
      const rev = await trx
        .insertInto('app.salary_payments')
        .values({ line_id: p.line_id, employee_id: p.employee_id, cluster_id: p.cluster_id, amount_paise: -Number(p.amount_paise), paid_on: today, method: p.method, reference: null, reverses_payment_id: p.id, note: reason, recorded_by: actor.id })
        .returning('id')
        .executeTakeFirstOrThrow()
        .catch((err: unknown) => {
          if ((err as { code?: string }).code === '23505') throw businessRule('This payment is already reversed');
          throw err;
        });
      await trx
        .insertInto('app.expense_entries')
        .values({ cluster_id: p.cluster_id, amount_paise: -Number(p.amount_paise), entry_date: today, salary_payment_id: rev.id, description: `Reversal: ${reason}`, created_by: actor.id })
        .execute();
      await auditAdmin(trx, actor, requestId, { action: 'salary.payment_reversed', targetType: 'salary_payment', targetId: p.id, reason });
      return (await this.lines(trx, { lineId: p.line_id }))[0]!;
    });
  }

  async exportCsv(actor: AdminActor, requestId: string, runId: string): Promise<string> {
    const d = await this.detail(actor, runId);
    await this.tx(actor, (trx) => auditAdmin(trx, actor, requestId, { action: 'payroll.exported', targetType: 'payroll_run', targetId: runId }));
    const esc = (v: string | number) => {
      const s = String(v);
      // Neutralise spreadsheet formulas and quote.
      const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const head = ['Employee ID', 'Name', 'Payable days', 'Days in month', 'Earnings', 'Deductions', 'Net', 'Paid', 'Status', 'Flags'];
    const rows = d.lines.map((l) =>
      [l.employee.employeeCode, l.employee.fullName, l.payableDays, l.daysInMonth, (l.earningsPaise / 100).toFixed(2), (l.deductionsPaise / 100).toFixed(2), (l.netPaise / 100).toFixed(2), (l.paidPaise / 100).toFixed(2), l.paymentStatus, l.flags.join(' ')]
        .map(esc)
        .join(','),
    );
    return [head.map(esc).join(','), ...rows].join('\r\n');
  }

  // ------------------------------------------------------------------ finance overview

  async financeSummary(actor: AdminActor): Promise<FinanceSummary> {
    this.requireGlobal(actor);
    return this.tx(actor, async (trx) => {
      const rows = await sql<{ month: string; collected: string; refunded: string; salary: string; bookings: string }>`
        with months as (
          select to_char(m, 'YYYY-MM') as month, m as start
            from generate_series(date_trunc('month', (now() at time zone 'Asia/Kolkata')::date) - interval '5 months', date_trunc('month', (now() at time zone 'Asia/Kolkata')::date), interval '1 month') m
        )
        select months.month,
          (select coalesce(sum(t.amount_paise), 0) from app.payment_transactions t where date_trunc('month', t.verified_at) = months.start) as collected,
          (select coalesce(sum(r.amount_paise), 0) from app.refund_records r where r.status = 'PROCESSED' and date_trunc('month', r.processed_at) = months.start) as refunded,
          (select coalesce(sum(x.amount_paise), 0) from app.expense_entries x where x.category = 'SALARY' and date_trunc('month', x.entry_date) = months.start) as salary,
          (select count(*) from app.bookings b where b.status = 'CONFIRMED' and date_trunc('month', b.confirmed_at) = months.start) as bookings
        from months order by months.month desc
      `.execute(trx);
      return {
        months: rows.rows.map((r) => ({ month: r.month, collectedPaise: Number(r.collected), refundedPaise: Number(r.refunded), salaryPaidPaise: Number(r.salary), bookingsConfirmed: Number(r.bookings) })),
      };
    });
  }

  // ------------------------------------------------------------------ worker payslips

  async payslips(actor: EmployeeActor): Promise<Payslip[]> {
    return withTx(this.db, employeeClaims(actor), async (trx) => {
      const rows = await trx
        .selectFrom('app.payroll_lines as l')
        .innerJoin('app.payroll_runs as r', 'r.id', 'l.run_id')
        .innerJoin('app.payroll_periods as p', 'p.id', 'r.period_id')
        .select(['l.id', 'l.payable_days', 'l.days_in_month', 'l.earnings_paise', 'l.deductions_paise', 'l.net_paise', sql<string>`to_char(p.month, 'YYYY-MM')`.as('month')])
        .where('l.employee_id', '=', actor.id)
        .where('r.status', '=', 'APPROVED')
        .orderBy('p.month', 'desc')
        .limit(24)
        .execute();
      const pays = rows.length ? await trx.selectFrom('app.salary_payments').select(['line_id', 'amount_paise']).where('line_id', 'in', rows.map((r) => r.id)).execute() : [];
      return rows.map((r) => {
        const paid = pays.filter((p) => p.line_id === r.id).reduce((s, p) => s + Number(p.amount_paise), 0);
        const net = Number(r.net_paise);
        return {
          month: r.month,
          payableDays: r.payable_days,
          daysInMonth: r.days_in_month,
          earningsPaise: Number(r.earnings_paise),
          deductionsPaise: Number(r.deductions_paise),
          netPaise: net,
          paidPaise: paid,
          paymentStatus: net <= 0 ? 'NOT_PAYABLE' : paid <= 0 ? 'PENDING' : paid < net ? 'PARTIALLY_PAID' : 'PAID',
        };
      });
    });
  }
}
