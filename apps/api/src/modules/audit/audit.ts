import type { Tx } from '../../db/database';
import type { AdminActor } from '../../auth/permissions';

export interface AuditEntry {
  /** `<area>.<verb>`, e.g. `community.created`. */
  action: string;
  targetType: string;
  targetId: string | null;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Writes an audit row in the same transaction as the change it describes, so a
 * change can never be committed without its audit record (and vice versa).
 */
export async function auditAdmin(trx: Tx, actor: AdminActor, requestId: string, entry: AuditEntry): Promise<void> {
  await trx
    .insertInto('app.audit_events')
    .values({
      actor_id: actor.id,
      actor_kind: 'admin',
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId,
      request_id: requestId,
      reason: entry.reason ?? null,
      before_data: entry.before === undefined ? null : JSON.stringify(entry.before),
      after_data: entry.after === undefined ? null : JSON.stringify(entry.after),
    })
    .execute();
}

/** Audit row for a resident's own action (e.g. registering a flat, adding family). */
export async function auditResident(trx: Tx, residentId: string, requestId: string, entry: AuditEntry): Promise<void> {
  await trx
    .insertInto('app.audit_events')
    .values({
      actor_id: residentId,
      actor_kind: 'resident',
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId,
      request_id: requestId,
      reason: entry.reason ?? null,
      before_data: entry.before === undefined ? null : JSON.stringify(entry.before),
      after_data: entry.after === undefined ? null : JSON.stringify(entry.after),
    })
    .execute();
}

export async function auditSystem(
  trx: Tx,
  actorKind: 'system' | 'public',
  requestId: string | null,
  entry: AuditEntry,
): Promise<void> {
  await trx
    .insertInto('app.audit_events')
    .values({
      actor_id: null,
      actor_kind: actorKind,
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId,
      request_id: requestId,
      reason: entry.reason ?? null,
      before_data: entry.before === undefined ? null : JSON.stringify(entry.before),
      after_data: entry.after === undefined ? null : JSON.stringify(entry.after),
    })
    .execute();
}
