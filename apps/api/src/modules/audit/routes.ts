import { Router } from 'express';
import { z } from 'zod';
import type { ModuleKey } from '@nestovin/contracts';
import { paginationQuerySchema } from '@nestovin/contracts';
import type { AppDeps } from '../../http/context';
import { adminOf } from '../../http/context';
import { parseParam, parseQuery } from '../../http/middleware';
import { can, toDbClaims, type AdminActor } from '../../auth/permissions';
import { withTx } from '../../db/database';
import { forbidden } from '../../lib/errors';
import { decodeCursor, encodeCursor } from '../../lib/pagination';

/** Which module's view permission lets an admin read a record's history. */
const MODULE_OF: Record<string, ModuleKey> = {
  city: 'locations',
  cluster: 'locations',
  community: 'locations',
  tower: 'locations',
  flat: 'locations',
  expansion_vote: 'locations',
  import_batch: 'community_migration',
  catalogue_version: 'catalogue_pricing',
  plan: 'catalogue_pricing',
  plan_component: 'catalogue_pricing',
  residence_category: 'catalogue_pricing',
  time_window: 'catalogue_pricing',
  service_task: 'catalogue_pricing',
  resident: 'residents',
  residence_membership: 'residents',
  document: 'residents',
  family_access_request: 'family_requests',
  demand_cycle: 'demand_payments',
  demand_request: 'demand_payments',
  slot_set: 'demand_payments',
  booking: 'demand_payments',
  subscription: 'demand_payments',
  payment_order: 'demand_payments',
  payment_transaction: 'demand_payments',
  payment_exception: 'demand_payments',
  slot: 'scheduling',
  app_settings: 'scheduling',
  employee: 'employees',
  applicant: 'employees',
  leave_request: 'employees',
  verification_item: 'employees',
  training_item: 'employees',
  subscription_component: 'allocation',
  service_occurrence: 'allocation',
  attendance_event: 'attendance',
  attendance_correction: 'attendance',
  support_ticket: 'support',
  ticket_category: 'support',
  website_enquiry: 'support',
  business_holiday: 'support',
  payroll_run: 'finance_payroll',
  payroll_line: 'finance_payroll',
  salary_payment: 'finance_payroll',
  role: 'admin_access',
  admin: 'admin_access',
};

export interface AuditEntryView {
  id: string;
  at: string;
  actor: { kind: string; id: string | null; name: string | null };
  action: string;
  targetType: string;
  targetId: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
}

/**
 * Audit rows carry no cluster, so history is readable only by admins whose
 * scope covers every cluster (global scope or Super Admin) and who can view
 * the record's module. The full log is Super Admin only.
 */
function canReadHistory(actor: AdminActor, targetType: string): boolean {
  if (actor.isSuperAdmin) return true;
  if (actor.scope.type !== 'GLOBAL') return false;
  const module = MODULE_OF[targetType];
  return Boolean(module && can(actor, module, 'view'));
}

async function load(deps: AppDeps, actor: AdminActor, f: { targetType?: string; targetId?: string; actorId?: string; action?: string; from?: string; to?: string; limit: number; cursor?: string }) {
  return withTx(deps.db, toDbClaims(actor), async (trx) => {
    let q = trx
      .selectFrom('app.audit_events as e')
      .leftJoin('app.admin_profiles as a', (j) => j.onRef('a.id', '=', 'e.actor_id').on('e.actor_kind', '=', 'admin'))
      .leftJoin('app.resident_profiles as r', (j) => j.onRef('r.id', '=', 'e.actor_id').on('e.actor_kind', '=', 'resident'))
      .select(['e.id', 'e.occurred_at', 'e.actor_kind', 'e.actor_id', 'e.action', 'e.target_type', 'e.target_id', 'e.reason', 'e.before_data', 'e.after_data', 'a.full_name as admin_name', 'r.full_name as resident_name']);
    if (f.targetType) q = q.where('e.target_type', '=', f.targetType);
    if (f.targetId) q = q.where('e.target_id', '=', f.targetId);
    if (f.actorId) q = q.where('e.actor_id', '=', f.actorId);
    if (f.action) q = q.where('e.action', 'like', `${f.action.replace(/[\\%_]/g, (c) => '\\' + c)}%`);
    if (f.from) q = q.where('e.occurred_at', '>=', new Date(`${f.from}T00:00:00+05:30`));
    if (f.to) q = q.where('e.occurred_at', '<', new Date(new Date(`${f.to}T00:00:00+05:30`).getTime() + 86_400_000));
    const c = decodeCursor(f.cursor);
    if (c) q = q.where('e.id', '<', c.id);
    const rows = await q.orderBy('e.id', 'desc').limit(f.limit + 1).execute();
    const items: AuditEntryView[] = rows.slice(0, f.limit).map((r) => ({
      id: String(r.id),
      at: new Date(r.occurred_at).toISOString(),
      actor: { kind: r.actor_kind, id: r.actor_id, name: r.admin_name ?? r.resident_name ?? null },
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      reason: r.reason,
      before: r.before_data,
      after: r.after_data,
    }));
    const last = items[items.length - 1];
    return { items, nextCursor: rows.length > f.limit && last ? encodeCursor({ v: last.at, id: last.id }) : null };
  });
}

export function auditRoutes(deps: AppDeps): Router {
  const r = Router();
  // Record history panel: GET /audit/records/:type/:id
  r.get('/audit/records/:type/:id', async (req, res) => {
    const actor = adminOf(req);
    const type = parseParam(z.string().regex(/^[a-z_]{2,40}$/), req.params.type, 'type');
    if (!canReadHistory(actor, type)) throw forbidden('You cannot view this record’s history');
    const q = parseQuery(paginationQuerySchema, req);
    res.json(await load(deps, actor, { targetType: type, targetId: String(req.params.id).slice(0, 80), limit: q.limit, cursor: q.cursor }));
  });
  // Full audit log (Super Admin).
  r.get('/audit/events', async (req, res) => {
    const actor = adminOf(req);
    if (!actor.isSuperAdmin) throw forbidden('Only the Super Admin can browse the full audit log');
    const q = parseQuery(
      paginationQuerySchema.extend({
        targetType: z.string().regex(/^[a-z_]{2,40}$/).optional(),
        actorId: z.uuid().optional(),
        action: z.string().regex(/^[a-z_.]{1,60}$/).optional(),
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
      }),
      req,
    );
    res.json(await load(deps, actor, q));
  });
  return r;
}
