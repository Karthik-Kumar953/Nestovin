import type { EmployeeMe, EmployeeScheduleItem, LeaveRequest } from '@nestovin/contracts';
import type { AppDeps } from '../../http/context';
import type { Handler } from '../../http/middleware';
import type { Database, DbClaims, Tx } from '../../db/database';
import { withTx } from '../../db/database';
import { businessRule, forbidden, notFound, unauthenticated } from '../../lib/errors';
import { SYSTEM_CLAIMS } from '../bookings/payments';
import { STAFF_EMAIL_DOMAIN } from './admin-service';

export interface EmployeeActor {
  id: string;
  employeeCode: string;
  clusterId: string;
  mustChangePassword: boolean;
}

export function employeeClaims(actor: { id: string }): DbClaims {
  return { userId: actor.id, actorKind: 'employee', isSuperAdmin: false, clusterIds: [] };
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      employee?: EmployeeActor;
    }
  }
}

export function employeeOf(req: { employee?: EmployeeActor }): EmployeeActor {
  if (!req.employee) throw new Error('requireEmployee middleware is missing for this route');
  return req.employee;
}

/**
 * Worker authentication (EMP-02, ADR-012): Supabase session for the internal
 * staff email; the employee must be ACTIVE with login enabled, and sessions
 * issued before the last password reset are rejected. Until the temporary
 * password is changed, only the profile and password routes work.
 */
export function requireEmployee(deps: AppDeps): Handler {
  return async (req, _res, next) => {
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw unauthenticated();
    let verified;
    try {
      verified = await deps.tokenVerifier.verify(token);
    } catch {
      throw unauthenticated('Your session is invalid or has expired. Sign in again.');
    }
    if (!verified.email?.endsWith(`@${STAFF_EMAIL_DOMAIN}`)) throw unauthenticated('Sign in with your Employee ID');
    const e = await withTx(deps.db, SYSTEM_CLAIMS, (trx) =>
      trx
        .selectFrom('app.employees')
        .select(['id', 'employee_code', 'home_cluster_id', 'status', 'login_enabled_at', 'must_change_password', 'sessions_valid_after'])
        .where('auth_user_id', '=', verified.userId)
        .executeTakeFirst(),
    );
    if (!e || !e.login_enabled_at) throw unauthenticated('Your session is invalid or has expired. Sign in again.');
    if (e.status !== 'ACTIVE') throw unauthenticated('This account is not active. Contact HR.');
    if (e.sessions_valid_after && verified.issuedAt && verified.issuedAt * 1000 < new Date(e.sessions_valid_after).getTime() - 1000) {
      throw unauthenticated('Your password was reset. Sign in again.');
    }
    req.employee = { id: e.id, employeeCode: e.employee_code, clusterId: e.home_cluster_id, mustChangePassword: e.must_change_password };
    const open = req.path === '/me' || req.path === '/me/password-changed';
    if (e.must_change_password && !open) throw forbidden('Change your temporary password to continue');
    next();
  };
}

/** EMP-03/04/05/09 for the Worker app. RLS limits every read to the employee's own rows. */
export class EmployeeService {
  constructor(private readonly db: Database) {}

  private tx<T>(actor: EmployeeActor, fn: (trx: Tx) => Promise<T>) {
    return withTx(this.db, employeeClaims(actor), fn);
  }

  async me(actor: EmployeeActor): Promise<EmployeeMe> {
    return this.tx(actor, async (trx) => {
      const e = await trx.selectFrom('app.employees').selectAll().where('id', '=', actor.id).executeTakeFirstOrThrow();
      const services = await trx
        .selectFrom('app.employee_qualifications as q')
        .innerJoin('app.services as s', 's.id', 'q.service_id')
        .select('s.name')
        .where('q.employee_id', '=', actor.id)
        .execute();
      const checks = await trx
        .selectFrom('app.verification_items as i')
        .leftJoin('app.employee_verifications as v', (j) => j.onRef('v.item_id', '=', 'i.id').on('v.employee_id', '=', actor.id))
        .select(['i.name', 'v.status'])
        .where('i.status', '=', 'ACTIVE')
        .orderBy('i.sort')
        .execute();
      const availability = await trx.selectFrom('app.employee_availability').selectAll().where('employee_id', '=', actor.id).execute();
      const training = await trx
        .selectFrom('app.training_items as t')
        .leftJoin('app.training_completions as c', (j) => j.onRef('c.item_id', '=', 't.id').on('c.employee_id', '=', actor.id))
        .select(['t.id', 't.title', 't.url', 'c.completed_at'])
        .where('t.status', '=', 'ACTIVE')
        .orderBy('t.sort')
        .execute();
      return {
        id: e.id,
        employeeCode: e.employee_code,
        fullName: e.full_name,
        phone: e.phone,
        readiness: e.readiness,
        mustChangePassword: e.must_change_password,
        services: services.map((s) => s.name),
        verifications: checks.map((c) => ({ name: c.name, status: c.status ?? null })),
        availability: availability.map((a) => ({ daysOfWeek: a.days_of_week, startTime: a.start_time.slice(0, 5), endTime: a.end_time.slice(0, 5) })),
        training: training.map((t) => ({ itemId: t.id, title: t.title, url: t.url, completedAt: t.completed_at ? new Date(t.completed_at).toISOString() : null })),
      };
    });
  }

  /** Called by the app after the worker sets a new password with Supabase Auth. */
  async passwordChanged(actor: EmployeeActor) {
    await this.tx(actor, (trx) => trx.updateTable('app.employees').set({ must_change_password: false }).where('id', '=', actor.id).execute());
    return this.me(actor);
  }

  async schedule(actor: EmployeeActor, from: string, to: string): Promise<EmployeeScheduleItem[]> {
    return this.tx(actor, async (trx) => {
      const rows = await trx
        .selectFrom('app.occurrence_assignments as a')
        .innerJoin('app.service_occurrences as o', 'o.id', 'a.occurrence_id')
        .innerJoin('app.services as s', 's.id', 'o.service_id')
        .innerJoin('app.flats as f', 'f.id', 'o.flat_id')
        .innerJoin('app.towers as t', 't.id', 'f.tower_id')
        .innerJoin('app.communities as c', 'c.id', 'o.community_id')
        .select(['o.id', 'o.scheduled_date', 'o.starts_at', 'o.ends_at', 'o.status', 'a.source', 's.name as service_name', 'f.flat_number', 't.name as tower_name', 'c.name as community_name'])
        .where('a.employee_id', '=', actor.id)
        .where('a.status', '=', 'ACTIVE')
        .where('o.scheduled_date', '>=', from)
        .where('o.scheduled_date', '<=', to)
        .orderBy('o.starts_at')
        .execute();
      return rows.map((r) => ({
        occurrenceId: r.id,
        scheduledDate: r.scheduled_date,
        startsAt: r.starts_at ? new Date(r.starts_at).toISOString() : null,
        endsAt: r.ends_at ? new Date(r.ends_at).toISOString() : null,
        serviceName: r.service_name,
        flat: { flatNumber: r.flat_number, towerName: r.tower_name, communityName: r.community_name },
        status: r.status,
        source: r.source,
      }));
    });
  }

  async leave(actor: EmployeeActor): Promise<LeaveRequest[]> {
    return this.tx(actor, async (trx) => {
      const rows = await trx.selectFrom('app.leave_requests').selectAll().where('employee_id', '=', actor.id).orderBy('start_date', 'desc').limit(50).execute();
      return rows.map((l) => ({
        id: l.id,
        employee: { id: actor.id, employeeCode: actor.employeeCode, fullName: '' },
        startDate: l.start_date,
        endDate: l.end_date,
        reason: l.reason,
        status: l.status,
        reviewNote: l.review_note,
        affectedAssignments: 0,
        createdAt: new Date(l.created_at).toISOString(),
        version: l.version,
      }));
    });
  }

  async requestLeave(actor: EmployeeActor, input: { startDate: string; endDate: string; reason?: string | undefined }) {
    if (input.endDate < input.startDate) throw businessRule('The leave must end on or after its start date');
    if (input.startDate < new Date().toISOString().slice(0, 10)) throw businessRule('Leave cannot start in the past');
    await this.tx(actor, async (trx) => {
      const overlap = await trx
        .selectFrom('app.leave_requests')
        .select('id')
        .where('employee_id', '=', actor.id)
        .where('status', 'in', ['PENDING', 'APPROVED'])
        .where('start_date', '<=', input.endDate)
        .where('end_date', '>=', input.startDate)
        .executeTakeFirst();
      if (overlap) throw businessRule('You already have leave requested for these dates');
      await trx.insertInto('app.leave_requests').values({ employee_id: actor.id, cluster_id: actor.clusterId, start_date: input.startDate, end_date: input.endDate, reason: input.reason ?? null }).execute();
    });
    return this.leave(actor);
  }

  async cancelLeave(actor: EmployeeActor, id: string) {
    await this.tx(actor, async (trx) => {
      const r = await trx.updateTable('app.leave_requests').set({ status: 'CANCELLED' }).where('id', '=', id).where('employee_id', '=', actor.id).where('status', '=', 'PENDING').executeTakeFirst();
      if (r.numUpdatedRows === 0n) throw businessRule('Only a pending leave request can be cancelled');
    });
    return this.leave(actor);
  }

  async completeTraining(actor: EmployeeActor, itemId: string) {
    await this.tx(actor, async (trx) => {
      const item = await trx.selectFrom('app.training_items').select('status').where('id', '=', itemId).executeTakeFirst();
      if (!item || item.status !== 'ACTIVE') throw notFound('Training');
      await trx
        .insertInto('app.training_completions')
        .values({ employee_id: actor.id, item_id: itemId, cluster_id: actor.clusterId })
        .onConflict((oc) => oc.columns(['employee_id', 'item_id']).doNothing())
        .execute();
    });
    return this.me(actor);
  }
}

