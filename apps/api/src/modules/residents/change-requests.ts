import { sql } from 'kysely';
import { z } from 'zod';
import type { Database, Tx } from '../../db/database';
import { withTx } from '../../db/database';
import { inScope, toDbClaims, type AdminActor } from '../../auth/permissions';
import { businessRule, conflict, notFound } from '../../lib/errors';
import { auditAdmin, auditResident } from '../audit/audit';
import { residentClaims, type ResidentActor } from './auth';

export const createChangeRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('OCCUPANCY_CHANGE'), occupancy: z.enum(['OWNER', 'TENANT']), reason: z.string().trim().max(500).optional() }),
  z.object({ kind: z.literal('MOVE_OUT'), moveOutDate: z.iso.date(), reason: z.string().trim().max(500).optional() }),
]);
export type CreateChangeRequestInput = z.infer<typeof createChangeRequestSchema>;
export const decideChangeRequestSchema = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), note: z.string().trim().min(3).max(500) });

export interface ChangeRequestView {
  id: string;
  kind: 'OCCUPANCY_CHANGE' | 'MOVE_OUT';
  requested: Record<string, unknown>;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  resident: { id: string; fullName: string | null; phone: string };
  flat: { flatNumber: string; towerName: string; communityName: string };
  currentOccupancy: string;
  membershipKind: string;
}

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

/** RES-14 controlled changes to verified residence data. */
export class ChangeRequestService {
  constructor(private readonly db: Database) {}

  private query(trx: Tx) {
    return trx
      .selectFrom('app.resident_change_requests as c')
      .innerJoin('app.resident_profiles as p', 'p.id', 'c.resident_id')
      .innerJoin('app.residence_memberships as m', 'm.id', 'c.membership_id')
      .innerJoin('app.flats as f', 'f.id', 'c.flat_id')
      .innerJoin('app.towers as t', 't.id', 'f.tower_id')
      .innerJoin('app.communities as co', 'co.id', 'c.community_id')
      .selectAll('c')
      .select(['p.full_name', 'p.phone', 'f.flat_number', 't.name as tower_name', 'co.name as community_name', 'm.occupancy', 'm.kind as membership_kind']);
  }

  private view(r: Awaited<ReturnType<ReturnType<ChangeRequestService['query']>['execute']>>[number]): ChangeRequestView {
    return {
      id: r.id,
      kind: r.kind,
      requested: (r.requested ?? {}) as Record<string, unknown>,
      reason: r.reason,
      status: r.status,
      reviewNote: r.review_note,
      createdAt: iso(r.created_at)!,
      reviewedAt: iso(r.reviewed_at),
      resident: { id: r.resident_id, fullName: r.full_name, phone: r.phone },
      flat: { flatNumber: r.flat_number, towerName: r.tower_name, communityName: r.community_name },
      currentOccupancy: r.occupancy,
      membershipKind: r.membership_kind,
    };
  }

  // ---------------------------------------------------------------- resident

  async mine(actor: ResidentActor): Promise<ChangeRequestView[]> {
    return withTx(this.db, residentClaims(actor), async (trx) => (await this.query(trx).where('c.resident_id', '=', actor.id).orderBy('c.created_at', 'desc').limit(50).execute()).map((r) => this.view(r)));
  }

  async create(actor: ResidentActor, requestId: string, input: CreateChangeRequestInput): Promise<ChangeRequestView[]> {
    await withTx(this.db, residentClaims(actor), async (trx) => {
      const m = await trx
        .selectFrom('app.residence_memberships')
        .select(['id', 'kind', 'occupancy', 'status', 'flat_id', 'community_id', 'cluster_id'])
        .where('resident_id', '=', actor.id)
        .where('status', '=', 'VERIFIED')
        .executeTakeFirst();
      if (!m) throw businessRule('You need a verified residence to request this change');
      if (input.kind === 'OCCUPANCY_CHANGE') {
        if (m.kind !== 'PRIMARY') throw businessRule('Only the Primary Resident can change how the flat is occupied');
        if (m.occupancy === input.occupancy) throw businessRule('Your residence already has this occupancy');
      }
      if (input.kind === 'MOVE_OUT' && input.moveOutDate < new Date().toISOString().slice(0, 10)) throw businessRule('The move-out date cannot be in the past');
      const requested = input.kind === 'OCCUPANCY_CHANGE' ? { occupancy: input.occupancy } : { moveOutDate: input.moveOutDate };
      try {
        const row = await trx
          .insertInto('app.resident_change_requests')
          .values({ resident_id: actor.id, membership_id: m.id, flat_id: m.flat_id, community_id: m.community_id, cluster_id: m.cluster_id, kind: input.kind, requested: JSON.stringify(requested), reason: input.reason ?? null })
          .returning('id')
          .executeTakeFirstOrThrow();
        await auditResident(trx, actor.id, requestId, { action: 'change_request.created', targetType: 'resident', targetId: actor.id, after: { kind: input.kind, ...requested, requestId: row.id } });
      } catch (err) {
        if ((err as { code?: string }).code === '23505') throw conflict('A request of this type is already waiting for review');
        throw err;
      }
    });
    return this.mine(actor);
  }

  async cancel(actor: ResidentActor, requestId: string, id: string): Promise<ChangeRequestView[]> {
    await withTx(this.db, residentClaims(actor), async (trx) => {
      const r = await trx.updateTable('app.resident_change_requests').set({ status: 'CANCELLED' }).where('id', '=', id).where('resident_id', '=', actor.id).where('status', '=', 'PENDING').executeTakeFirst();
      if (r.numUpdatedRows === 0n) throw businessRule('Only a pending request can be cancelled');
      await auditResident(trx, actor.id, requestId, { action: 'change_request.cancelled', targetType: 'resident', targetId: actor.id });
    });
    return this.mine(actor);
  }

  // ---------------------------------------------------------------- admin

  async list(actor: AdminActor, status: string): Promise<ChangeRequestView[]> {
    return withTx(this.db, toDbClaims(actor), async (trx) =>
      (await this.query(trx).where('c.status', '=', status as ChangeRequestView['status']).orderBy('c.created_at').limit(200).execute()).map((r) => this.view(r)),
    );
  }

  /**
   * Approval applies the change. A move-out ends the residence and, for a
   * Primary Resident, the household's family access. It is refused while a
   * paid subscription is current (cancellation/refund policy is OPEN).
   */
  async decide(actor: AdminActor, requestId: string, id: string, input: { decision: 'APPROVED' | 'REJECTED'; note: string }) {
    return withTx(this.db, toDbClaims(actor), async (trx) => {
      const c = await trx.selectFrom('app.resident_change_requests').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!c || !inScope(actor, c.cluster_id)) throw notFound('Change request');
      if (c.status !== 'PENDING') throw businessRule('This request has already been decided');
      const m = await trx.selectFrom('app.residence_memberships').selectAll().where('id', '=', c.membership_id).forUpdate().executeTakeFirstOrThrow();
      if (input.decision === 'APPROVED') {
        if (m.status !== 'VERIFIED') throw businessRule('This residence is no longer verified');
        const requested = c.requested as { occupancy?: 'OWNER' | 'TENANT'; moveOutDate?: string };
        if (c.kind === 'OCCUPANCY_CHANGE') {
          await trx.updateTable('app.residence_memberships').set({ occupancy: requested.occupancy! }).where('id', '=', m.id).execute();
        } else {
          if (m.kind === 'PRIMARY') {
            const current = await trx
              .selectFrom('app.subscriptions')
              .select('id')
              .where('flat_id', '=', m.flat_id)
              .where('status', 'in', ['PENDING_ACTIVATION', 'ACTIVE'])
              .executeTakeFirst();
            if (current) throw businessRule('This household has a current subscription. Resolve it before approving the move-out.');
            await trx
              .updateTable('app.residence_memberships')
              .set({ status: 'ENDED', ended_at: sql`now()`, end_reason: 'Primary Resident moved out' })
              .where('primary_membership_id', '=', m.id)
              .where('status', 'in', ['PENDING', 'VERIFIED'])
              .execute();
          }
          await trx.updateTable('app.residence_memberships').set({ status: 'ENDED', ended_at: sql`now()`, end_reason: `Moved out (${requested.moveOutDate})` }).where('id', '=', m.id).execute();
        }
      }
      await trx.updateTable('app.resident_change_requests').set({ status: input.decision, reviewed_by: actor.id, reviewed_at: sql`now()`, review_note: input.note }).where('id', '=', id).execute();
      await auditAdmin(trx, actor, requestId, {
        action: `change_request.${input.decision.toLowerCase()}`,
        targetType: 'resident',
        targetId: c.resident_id,
        reason: input.note,
        before: { occupancy: m.occupancy, status: m.status },
        after: { kind: c.kind, requested: c.requested },
      });
      return { status: input.decision };
    });
  }
}
