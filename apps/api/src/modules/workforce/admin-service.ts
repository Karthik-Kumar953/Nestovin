import { randomInt } from 'node:crypto';
import { sql } from 'kysely';
import type {
  Applicant,
  AvailabilityInput,
  CreateApplicantInput,
  CreateEmployeeInput,
  Employee,
  EmployeeDetail,
  LeaveRequest,
  TemporaryPassword,
  UpdateEmployeeInput,
} from '@nestovin/contracts';
import type { Database, Tx } from '../../db/database';
import { withTx } from '../../db/database';
import { inScope, toDbClaims, type AdminActor } from '../../auth/permissions';
import type { AuthAdminAdapter } from '../../integrations/auth-admin';
import { businessRule, conflict, notFound, versionConflict } from '../../lib/errors';
import { decodeCursor, likeContains, toPage } from '../../lib/pagination';
import { auditAdmin, auditSystem } from '../audit/audit';

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

export const STAFF_EMAIL_DOMAIN = 'staff.nestovin.invalid';
export const staffEmail = (employeeCode: string) => `${employeeCode.toLowerCase()}@${STAFF_EMAIL_DOMAIN}`;

/** 12 characters from an unambiguous alphabet (no 0/O/1/l/I). Shown once, never stored. */
export function temporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 12; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

const pgUnique = (err: unknown, constraint: string) =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505' && (err as { constraint?: string }).constraint === constraint;

/** ADM-09 employees & verification, EMP-01 applicants, EMP-09 leave decisions. */
export class WorkforceAdminService {
  constructor(
    private readonly db: Database,
    private readonly authAdmin: AuthAdminAdapter,
  ) {}

  private tx<T>(actor: AdminActor, fn: (trx: Tx) => Promise<T>) {
    return withTx(this.db, toDbClaims(actor), fn);
  }

  // ------------------------------------------------------------------ applicants

  /** Public intake (EMP-01). Never creates an employee or a login. */
  async submitApplicant(input: CreateApplicantInput, requestId: string) {
    await withTx(this.db, { userId: null, actorKind: 'public', isSuperAdmin: false, clusterIds: [] }, async (trx) => {
      // Duplicate open application for the same phone: same answer, nothing stored (no enumeration).
      await sql`select app.submit_applicant(${input.fullName}, ${input.phone}, ${input.city ?? null}, ${input.services}::text[], ${input.experienceNote ?? null})`.execute(trx);
      await auditSystem(trx, 'public', requestId, { action: 'applicant.submitted', targetType: 'applicant', targetId: null });
    });
    return { received: true as const };
  }

  private toApplicant(a: { id: string; full_name: string; phone: string; city: string | null; preferred_cluster_id: string | null; services: string[]; experience_note: string | null; source: 'APP' | 'ADMIN'; status: Applicant['status']; review_note: string | null; created_at: Date; version: number }): Applicant {
    return {
      id: a.id,
      fullName: a.full_name,
      phone: a.phone,
      city: a.city,
      preferredClusterId: a.preferred_cluster_id,
      services: a.services,
      experienceNote: a.experience_note,
      source: a.source,
      status: a.status,
      reviewNote: a.review_note,
      createdAt: iso(a.created_at)!,
      version: a.version,
    };
  }

  async applicants(actor: AdminActor, status: string | undefined): Promise<Applicant[]> {
    return this.tx(actor, async (trx) => {
      let q = trx.selectFrom('app.applicants').selectAll();
      if (status) q = q.where('status', '=', status as Applicant['status']);
      return (await q.orderBy('created_at', 'desc').limit(200).execute()).map((a) => this.toApplicant(a));
    });
  }

  async reviewApplicant(actor: AdminActor, requestId: string, id: string, input: { status: 'IN_REVIEW' | 'REJECTED'; note?: string | undefined; preferredClusterId?: string | null | undefined; version: number }) {
    return this.tx(actor, async (trx) => {
      const a = await trx.selectFrom('app.applicants').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!a) throw notFound('Applicant');
      if (a.version !== input.version) throw versionConflict();
      if (a.status === 'CONVERTED') throw businessRule('This applicant is already an employee');
      if (input.preferredClusterId && !inScope(actor, input.preferredClusterId)) throw notFound('Cluster');
      await trx
        .updateTable('app.applicants')
        .set({
          status: input.status,
          review_note: input.note ?? null,
          reviewed_by: actor.id,
          ...(input.preferredClusterId !== undefined ? { preferred_cluster_id: input.preferredClusterId } : {}),
        })
        .where('id', '=', id)
        .execute();
      await auditAdmin(trx, actor, requestId, { action: `applicant.${input.status.toLowerCase()}`, targetType: 'applicant', targetId: id, reason: input.note ?? null });
      return this.toApplicant(await trx.selectFrom('app.applicants').selectAll().where('id', '=', id).executeTakeFirstOrThrow());
    });
  }

  async convertApplicant(actor: AdminActor, requestId: string, id: string, input: { homeClusterId: string; joinedOn?: string | undefined; version: number }): Promise<EmployeeDetail> {
    const employeeId = await this.tx(actor, async (trx) => {
      const a = await trx.selectFrom('app.applicants').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!a) throw notFound('Applicant');
      if (a.version !== input.version) throw versionConflict();
      if (a.status === 'CONVERTED' || a.status === 'REJECTED') throw businessRule('Only an open application can become an employee');
      const e = await this.insertEmployee(trx, actor, requestId, { fullName: a.full_name, phone: a.phone, homeClusterId: input.homeClusterId, joinedOn: input.joinedOn }, a.id);
      await trx.updateTable('app.applicants').set({ status: 'CONVERTED', reviewed_by: actor.id }).where('id', '=', id).execute();
      return e;
    });
    return this.detail(actor, employeeId);
  }

  // ------------------------------------------------------------------ employees

  private async insertEmployee(trx: Tx, actor: AdminActor, requestId: string, input: CreateEmployeeInput, applicantId: string | null) {
    if (!inScope(actor, input.homeClusterId)) throw notFound('Cluster');
    const cluster = await trx.selectFrom('app.clusters').select('status').where('id', '=', input.homeClusterId).executeTakeFirst();
    if (!cluster || cluster.status !== 'ACTIVE') throw businessRule('Choose an active home cluster');
    try {
      const row = await trx
        .insertInto('app.employees')
        .values({ full_name: input.fullName, phone: input.phone, home_cluster_id: input.homeClusterId, joined_on: input.joinedOn ?? null, applicant_id: applicantId })
        .returning(['id', 'employee_code'])
        .executeTakeFirstOrThrow();
      await auditAdmin(trx, actor, requestId, { action: 'employee.created', targetType: 'employee', targetId: row.id, after: { employeeCode: row.employee_code, homeClusterId: input.homeClusterId } });
      return row.id;
    } catch (err) {
      if (pgUnique(err, 'employees_phone_active')) throw conflict('An employee with this phone number already exists', [{ path: 'phone', message: 'Already used by another employee' }]);
      throw err;
    }
  }

  async createEmployee(actor: AdminActor, requestId: string, input: CreateEmployeeInput): Promise<EmployeeDetail> {
    const id = await this.tx(actor, (trx) => this.insertEmployee(trx, actor, requestId, input, null));
    return this.detail(actor, id);
  }

  private employeeQuery(trx: Tx) {
    return trx
      .selectFrom('app.employees as e')
      .innerJoin('app.clusters as c', 'c.id', 'e.home_cluster_id')
      .selectAll('e')
      .select('c.name as cluster_name');
  }

  private async toEmployees(trx: Tx, rows: Awaited<ReturnType<ReturnType<WorkforceAdminService['employeeQuery']>['execute']>>): Promise<Employee[]> {
    const ids = rows.map((r) => r.id);
    const quals = ids.length
      ? await trx
          .selectFrom('app.employee_qualifications as q')
          .innerJoin('app.services as s', 's.id', 'q.service_id')
          .select(['q.employee_id', 's.id', 's.name'])
          .where('q.employee_id', 'in', ids)
          .orderBy('s.sort')
          .execute()
      : [];
    return rows.map((e) => ({
      id: e.id,
      employeeCode: e.employee_code,
      fullName: e.full_name,
      phone: e.phone,
      homeClusterId: e.home_cluster_id,
      homeClusterName: e.cluster_name,
      status: e.status,
      readiness: e.readiness,
      readinessNote: e.readiness_note,
      joinedOn: e.joined_on,
      loginEnabled: Boolean(e.auth_user_id && e.login_enabled_at),
      services: quals.filter((q) => q.employee_id === e.id).map((q) => ({ serviceId: q.id, name: q.name })),
      version: e.version,
    }));
  }

  async listEmployees(actor: AdminActor, p: { limit: number; cursor?: string | undefined; q?: string | undefined; readiness?: string | undefined; clusterId?: string | undefined; status?: string | undefined }) {
    return this.tx(actor, async (trx) => {
      const c = decodeCursor(p.cursor);
      let q = this.employeeQuery(trx);
      if (p.q) q = q.where((eb) => eb.or([eb('e.full_name', 'ilike', likeContains(p.q!)), eb('e.employee_code', 'ilike', likeContains(p.q!)), eb('e.phone', 'ilike', likeContains(p.q!))]));
      if (p.readiness) q = q.where('e.readiness', '=', p.readiness as 'READY' | 'NOT_READY');
      if (p.clusterId) q = q.where('e.home_cluster_id', '=', p.clusterId);
      q = q.where('e.status', '=', (p.status as 'ACTIVE' | 'INACTIVE' | 'EXITED' | undefined) ?? 'ACTIVE');
      if (c) q = q.where((eb) => eb.or([eb('e.employee_code', '>', c.v), eb.and([eb('e.employee_code', '=', c.v), eb('e.id', '>', c.id)])]));
      const rows = await q.orderBy('e.employee_code').orderBy('e.id').limit(p.limit + 1).execute();
      const page = toPage(rows, p.limit, (r) => ({ v: r.employee_code, id: r.id }));
      return { items: await this.toEmployees(trx, page.items), nextCursor: page.nextCursor };
    });
  }

  async detail(actor: AdminActor, id: string): Promise<EmployeeDetail> {
    return this.tx(actor, (trx) => this.loadDetail(trx, id));
  }

  /** Required checks not verified, or no qualification: blocks READY (ADM-09). */
  async readinessGaps(trx: Tx, employeeId: string): Promise<string[]> {
    const gaps: string[] = [];
    const missing = await trx
      .selectFrom('app.verification_items as i')
      .leftJoin('app.employee_verifications as v', (j) => j.onRef('v.item_id', '=', 'i.id').on('v.employee_id', '=', employeeId))
      .select(['i.name', 'v.status'])
      .where('i.status', '=', 'ACTIVE')
      .where('i.required', '=', true)
      .execute();
    for (const m of missing.filter((x) => x.status !== 'VERIFIED')) gaps.push(`${m.name} not verified`);
    const q = await trx.selectFrom('app.employee_qualifications').select('service_id').where('employee_id', '=', employeeId).executeTakeFirst();
    if (!q) gaps.push('No approved service qualification');
    return gaps;
  }

  private async loadDetail(trx: Tx, id: string): Promise<EmployeeDetail> {
    const row = await this.employeeQuery(trx).where('e.id', '=', id).executeTakeFirst();
    if (!row) throw notFound('Employee');
    const [base] = await this.toEmployees(trx, [row]);
    const items = await trx
      .selectFrom('app.verification_items as i')
      .leftJoin('app.employee_verifications as v', (j) => j.onRef('v.item_id', '=', 'i.id').on('v.employee_id', '=', id))
      .select(['i.id', 'i.name', 'i.required', 'v.status', 'v.note', 'v.reviewed_at'])
      .where((eb) => eb.or([eb('i.status', '=', 'ACTIVE'), eb('v.status', 'is not', null)]))
      .orderBy('i.sort')
      .orderBy('i.name')
      .execute();
    const availability = await trx.selectFrom('app.employee_availability').selectAll().where('employee_id', '=', id).orderBy('start_time').execute();
    const training = await trx
      .selectFrom('app.training_items as t')
      .leftJoin('app.training_completions as c', (j) => j.onRef('c.item_id', '=', 't.id').on('c.employee_id', '=', id))
      .select(['t.id', 't.title', 'c.completed_at'])
      .where('t.status', '=', 'ACTIVE')
      .orderBy('t.sort')
      .execute();
    return {
      ...base!,
      verifications: items.map((i) => ({ itemId: i.id, name: i.name, required: i.required, status: i.status ?? null, note: i.note ?? null, reviewedAt: i.reviewed_at ? iso(i.reviewed_at) : null })),
      availability: availability.map((a) => ({ id: a.id, daysOfWeek: a.days_of_week, startTime: a.start_time.slice(0, 5), endTime: a.end_time.slice(0, 5) })),
      training: training.map((t) => ({ itemId: t.id, title: t.title, completedAt: t.completed_at ? iso(t.completed_at) : null })),
      readinessGaps: await this.readinessGaps(trx, id),
    };
  }

  private async scopedEmployee(trx: Tx, actor: AdminActor, id: string) {
    const e = await trx.selectFrom('app.employees').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
    if (!e || !inScope(actor, e.home_cluster_id)) throw notFound('Employee');
    return e;
  }

  async updateEmployee(actor: AdminActor, requestId: string, id: string, input: UpdateEmployeeInput): Promise<EmployeeDetail> {
    return this.tx(actor, async (trx) => {
      const e = await this.scopedEmployee(trx, actor, id);
      if (e.version !== input.version) throw versionConflict();
      if (input.homeClusterId && input.homeClusterId !== e.home_cluster_id) {
        if (!inScope(actor, input.homeClusterId)) throw notFound('Cluster');
        const standing = await trx.selectFrom('app.standing_assignments').select('id').where('employee_id', '=', id).where('status', '=', 'ACTIVE').executeTakeFirst();
        if (standing) throw businessRule('Move this employee’s standing assignments to someone else before changing the home cluster');
      }
      if (input.status && input.status !== 'ACTIVE') {
        const standing = await trx.selectFrom('app.standing_assignments').select('id').where('employee_id', '=', id).where('status', '=', 'ACTIVE').executeTakeFirst();
        if (standing) throw businessRule('Replace this employee’s standing assignments before deactivating them');
      }
      try {
        await trx
          .updateTable('app.employees')
          .set({
            ...(input.fullName ? { full_name: input.fullName } : {}),
            ...(input.phone ? { phone: input.phone } : {}),
            ...(input.homeClusterId ? { home_cluster_id: input.homeClusterId } : {}),
            ...(input.status ? { status: input.status, ...(input.status !== 'ACTIVE' ? { readiness: 'NOT_READY' as const } : {}) } : {}),
            // Payroll proration needs the exit date (ADR-014).
            ...(input.status === 'EXITED' && e.status !== 'EXITED' ? { exited_on: new Date().toISOString().slice(0, 10) } : {}),
            ...(input.status && input.status !== 'EXITED' ? { exited_on: null } : {}),
            ...(input.joinedOn !== undefined ? { joined_on: input.joinedOn } : {}),
          })
          .where('id', '=', id)
          .execute();
      } catch (err) {
        if (pgUnique(err, 'employees_phone_active')) throw conflict('An employee with this phone number already exists', [{ path: 'phone', message: 'Already used by another employee' }]);
        throw err;
      }
      if (input.status && input.status !== 'ACTIVE' && e.auth_user_id) await this.authAdmin.setBanned(e.auth_user_id, true);
      if (input.status === 'ACTIVE' && e.status !== 'ACTIVE' && e.auth_user_id) await this.authAdmin.setBanned(e.auth_user_id, false);
      await auditAdmin(trx, actor, requestId, { action: 'employee.updated', targetType: 'employee', targetId: id, before: { status: e.status, cluster: e.home_cluster_id }, after: input });
      return this.loadDetail(trx, id);
    });
  }

  async setVerification(actor: AdminActor, requestId: string, id: string, itemId: string, input: { status: 'PENDING' | 'VERIFIED' | 'REJECTED'; note?: string | undefined }) {
    return this.tx(actor, async (trx) => {
      const e = await this.scopedEmployee(trx, actor, id);
      const item = await trx.selectFrom('app.verification_items').select('id').where('id', '=', itemId).executeTakeFirst();
      if (!item) throw notFound('Checklist item');
      await trx
        .insertInto('app.employee_verifications')
        .values({ employee_id: id, item_id: itemId, cluster_id: e.home_cluster_id, status: input.status, note: input.note ?? null, reviewed_by: actor.id })
        .onConflict((oc) => oc.columns(['employee_id', 'item_id']).doUpdateSet({ status: input.status, note: input.note ?? null, reviewed_by: actor.id, reviewed_at: sql`now()` }))
        .execute();
      // A failed or reopened required check takes the employee out of deployment.
      if (input.status !== 'VERIFIED' && e.readiness === 'READY' && (await this.readinessGaps(trx, id)).length) {
        await trx.updateTable('app.employees').set({ readiness: 'NOT_READY', readiness_note: 'A required check is no longer verified' }).where('id', '=', id).execute();
      }
      await auditAdmin(trx, actor, requestId, { action: 'employee.verification_recorded', targetType: 'employee', targetId: id, after: { itemId, status: input.status }, reason: input.note ?? null });
      return this.loadDetail(trx, id);
    });
  }

  async setQualifications(actor: AdminActor, requestId: string, id: string, serviceIds: string[]) {
    return this.tx(actor, async (trx) => {
      const e = await this.scopedEmployee(trx, actor, id);
      const before = (await trx.selectFrom('app.employee_qualifications').select('service_id').where('employee_id', '=', id).execute()).map((r) => r.service_id);
      const removed = before.filter((s) => !serviceIds.includes(s));
      if (removed.length) {
        const inUse = await trx
          .selectFrom('app.standing_assignments as a')
          .innerJoin('app.subscription_components as c', 'c.id', 'a.subscription_component_id')
          .select('a.id')
          .where('a.employee_id', '=', id)
          .where('a.status', '=', 'ACTIVE')
          .where('c.service_id', 'in', removed)
          .executeTakeFirst();
        if (inUse) throw businessRule('Replace the standing assignments for that service before removing the qualification');
      }
      await trx.deleteFrom('app.employee_qualifications').where('employee_id', '=', id).execute();
      if (serviceIds.length) {
        await trx
          .insertInto('app.employee_qualifications')
          .values([...new Set(serviceIds)].map((s) => ({ employee_id: id, service_id: s, cluster_id: e.home_cluster_id, approved_by: actor.id })))
          .execute();
      } else if (e.readiness === 'READY') {
        await trx.updateTable('app.employees').set({ readiness: 'NOT_READY', readiness_note: 'No approved qualification' }).where('id', '=', id).execute();
      }
      await auditAdmin(trx, actor, requestId, { action: 'employee.qualifications_set', targetType: 'employee', targetId: id, before, after: serviceIds });
      return this.loadDetail(trx, id);
    });
  }

  async setReadiness(actor: AdminActor, requestId: string, id: string, input: { readiness: 'READY' | 'NOT_READY'; note?: string | undefined; version: number }) {
    return this.tx(actor, async (trx) => {
      const e = await this.scopedEmployee(trx, actor, id);
      if (e.version !== input.version) throw versionConflict();
      if (input.readiness === 'READY') {
        if (e.status !== 'ACTIVE') throw businessRule('Only an active employee can be marked ready');
        const gaps = await this.readinessGaps(trx, id);
        if (gaps.length) throw businessRule(`Not ready yet: ${gaps.join('; ')}`);
      } else {
        const standing = await trx.selectFrom('app.standing_assignments').select('id').where('employee_id', '=', id).where('status', '=', 'ACTIVE').executeTakeFirst();
        if (standing) throw businessRule('Replace this employee’s standing assignments before marking them not ready');
      }
      await trx.updateTable('app.employees').set({ readiness: input.readiness, readiness_note: input.note ?? null }).where('id', '=', id).execute();
      await auditAdmin(trx, actor, requestId, { action: 'employee.readiness_set', targetType: 'employee', targetId: id, after: { readiness: input.readiness }, reason: input.note ?? null });
      return this.loadDetail(trx, id);
    });
  }

  async setAvailability(actor: AdminActor, requestId: string, id: string, input: AvailabilityInput) {
    return this.tx(actor, async (trx) => {
      const e = await this.scopedEmployee(trx, actor, id);
      for (const w of input.windows) if (w.endTime <= w.startTime) throw businessRule('Each availability window must end after it starts');
      await trx.deleteFrom('app.employee_availability').where('employee_id', '=', id).execute();
      if (input.windows.length) {
        await trx
          .insertInto('app.employee_availability')
          .values(input.windows.map((w) => ({ employee_id: id, cluster_id: e.home_cluster_id, days_of_week: w.daysOfWeek, start_time: w.startTime, end_time: w.endTime })))
          .execute();
      }
      await auditAdmin(trx, actor, requestId, { action: 'employee.availability_set', targetType: 'employee', targetId: id, after: input.windows });
      return this.loadDetail(trx, id);
    });
  }

  /** ADR-012: enable login (after readiness) and return a one-time temporary password. */
  async enableLogin(actor: AdminActor, requestId: string, id: string): Promise<TemporaryPassword> {
    return this.tx(actor, async (trx) => {
      const e = await this.scopedEmployee(trx, actor, id);
      if (e.status !== 'ACTIVE' || e.readiness !== 'READY') throw businessRule('Login can be enabled once the employee is active and ready');
      const password = temporaryPassword();
      if (e.auth_user_id) {
        await this.authAdmin.setPassword(e.auth_user_id, password);
        await this.authAdmin.setBanned(e.auth_user_id, false);
      } else {
        const { userId } = await this.authAdmin.createStaffUser(staffEmail(e.employee_code), password);
        await trx.updateTable('app.employees').set({ auth_user_id: userId }).where('id', '=', id).execute();
      }
      await trx
        .updateTable('app.employees')
        .set({ login_enabled_at: e.login_enabled_at ?? sql`now()`, must_change_password: true, sessions_valid_after: sql`now()` })
        .where('id', '=', id)
        .execute();
      await auditAdmin(trx, actor, requestId, { action: e.auth_user_id ? 'employee.password_reset' : 'employee.login_enabled', targetType: 'employee', targetId: id });
      return { employeeCode: e.employee_code, temporaryPassword: password };
    });
  }

  // ------------------------------------------------------------------ pickers

  async serviceOptions(actor: AdminActor) {
    return this.tx(actor, (trx) => trx.selectFrom('app.services').select(['id', 'code', 'name']).orderBy('sort').execute());
  }

  async clusterOptions(actor: AdminActor) {
    return this.tx(actor, async (trx) => {
      const rows = await trx.selectFrom('app.clusters').select(['id', 'name', 'code']).where('status', '=', 'ACTIVE').orderBy('name').execute();
      return rows.filter((c) => inScope(actor, c.id));
    });
  }

  // ------------------------------------------------------------------ checklist & training config

  async verificationItems(actor: AdminActor) {
    return this.tx(actor, (trx) => trx.selectFrom('app.verification_items').selectAll().orderBy('sort').orderBy('name').execute());
  }

  async upsertVerificationItem(actor: AdminActor, requestId: string, id: string | null, input: { name: string; required: boolean; status?: 'ACTIVE' | 'INACTIVE' | undefined }) {
    return this.tx(actor, async (trx) => {
      const values = { name: input.name, required: input.required, ...(input.status ? { status: input.status } : {}) };
      try {
        const row = id
          ? await trx.updateTable('app.verification_items').set(values).where('id', '=', id).returning('id').executeTakeFirst()
          : await trx.insertInto('app.verification_items').values(values).returning('id').executeTakeFirst();
        if (!row) throw notFound('Checklist item');
        await auditAdmin(trx, actor, requestId, { action: id ? 'verification_item.updated' : 'verification_item.created', targetType: 'verification_item', targetId: row.id, after: values });
      } catch (err) {
        if (pgUnique(err, 'verification_items_name_key')) throw conflict('This checklist item already exists', [{ path: 'name', message: 'Already exists' }]);
        throw err;
      }
      return trx.selectFrom('app.verification_items').selectAll().orderBy('sort').orderBy('name').execute();
    });
  }

  async trainingItems(actor: AdminActor) {
    return this.tx(actor, (trx) => trx.selectFrom('app.training_items').selectAll().orderBy('sort').orderBy('title').execute());
  }

  async upsertTrainingItem(actor: AdminActor, requestId: string, id: string | null, input: { title: string; url: string; status?: 'ACTIVE' | 'INACTIVE' | undefined }) {
    return this.tx(actor, async (trx) => {
      const values = { title: input.title, url: input.url, ...(input.status ? { status: input.status } : {}) };
      const row = id
        ? await trx.updateTable('app.training_items').set(values).where('id', '=', id).returning('id').executeTakeFirst()
        : await trx.insertInto('app.training_items').values(values).returning('id').executeTakeFirst();
      if (!row) throw notFound('Training item');
      await auditAdmin(trx, actor, requestId, { action: id ? 'training_item.updated' : 'training_item.created', targetType: 'training_item', targetId: row.id, after: values });
      return trx.selectFrom('app.training_items').selectAll().orderBy('sort').orderBy('title').execute();
    });
  }

  // ------------------------------------------------------------------ leave (EMP-09)

  async leaveRequests(actor: AdminActor, status: string): Promise<LeaveRequest[]> {
    return this.tx(actor, async (trx) => {
      const rows = await trx
        .selectFrom('app.leave_requests as l')
        .innerJoin('app.employees as e', 'e.id', 'l.employee_id')
        .selectAll('l')
        .select(['e.employee_code', 'e.full_name'])
        .select((eb) =>
          eb
            .selectFrom('app.occurrence_assignments as a')
            .innerJoin('app.service_occurrences as o', 'o.id', 'a.occurrence_id')
            .select((e2) => e2.fn.countAll<string>().as('n'))
            .whereRef('a.employee_id', '=', 'l.employee_id')
            .where('a.status', '=', 'ACTIVE')
            .whereRef('o.scheduled_date', '>=', 'l.start_date')
            .whereRef('o.scheduled_date', '<=', 'l.end_date')
            .as('affected'),
        )
        .where('l.status', '=', status as LeaveRequest['status'])
        .orderBy('l.start_date')
        .limit(200)
        .execute();
      return rows.map((l) => ({
        id: l.id,
        employee: { id: l.employee_id, employeeCode: l.employee_code, fullName: l.full_name },
        startDate: l.start_date,
        endDate: l.end_date,
        reason: l.reason,
        status: l.status,
        reviewNote: l.review_note,
        affectedAssignments: Number(l.affected ?? 0),
        createdAt: iso(l.created_at)!,
        version: l.version,
      }));
    });
  }

  /**
   * Approved leave removes availability. Assignments already made inside the
   * period are released (status back to SCHEDULED) so Operations can replace them.
   */
  async decideLeave(actor: AdminActor, requestId: string, id: string, input: { decision: 'APPROVED' | 'REJECTED'; note?: string | undefined; version: number }) {
    return this.tx(actor, async (trx) => {
      const l = await trx.selectFrom('app.leave_requests').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!l || !inScope(actor, l.cluster_id)) throw notFound('Leave request');
      if (l.version !== input.version) throw versionConflict();
      if (l.status !== 'PENDING') throw businessRule('This leave request has already been decided');
      await trx.updateTable('app.leave_requests').set({ status: input.decision, review_note: input.note ?? null, reviewed_by: actor.id, reviewed_at: sql`now()` }).where('id', '=', id).execute();
      let released = 0;
      if (input.decision === 'APPROVED') {
        const affected = await trx
          .selectFrom('app.occurrence_assignments as a')
          .innerJoin('app.service_occurrences as o', 'o.id', 'a.occurrence_id')
          .select(['a.id', 'a.occurrence_id'])
          .where('a.employee_id', '=', l.employee_id)
          .where('a.status', '=', 'ACTIVE')
          .where('o.scheduled_date', '>=', l.start_date)
          .where('o.scheduled_date', '<=', l.end_date)
          .where('o.status', 'in', ['SCHEDULED', 'ASSIGNED'])
          .execute();
        for (const a of affected) {
          await trx.updateTable('app.occurrence_assignments').set({ status: 'CANCELLED', reason: 'Employee on approved leave' }).where('id', '=', a.id).execute();
          await trx.updateTable('app.service_occurrences').set({ status: 'SCHEDULED' }).where('id', '=', a.occurrence_id).execute();
        }
        released = affected.length;
      }
      await auditAdmin(trx, actor, requestId, { action: `leave.${input.decision.toLowerCase()}`, targetType: 'leave_request', targetId: id, reason: input.note ?? null, after: { released } });
      return { status: input.decision, releasedAssignments: released };
    });
  }
}
