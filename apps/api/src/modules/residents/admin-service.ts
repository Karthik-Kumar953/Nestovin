import { sql } from 'kysely';
import type {
  AdminBooking,
  AdminFamilyRequest,
  AdminResident,
  AdminResidentDetail,
  AdminUpdateResidentInput,
  ApproveFamilyInput,
  ResidentBookingAdmin,
  DocumentUrl,
  SetResidentStatusInput,
  VerificationRequest,
} from '@nestovin/contracts';
import type { Database, Tx } from '../../db/database';
import { withTx } from '../../db/database';
import { toDbClaims, type AdminActor } from '../../auth/permissions';
import type { StorageAdapter } from '../../integrations/storage';
import { businessRule, notFound, versionConflict } from '../../lib/errors';
import { decodeCursor, likeContains, toPage } from '../../lib/pagination';
import { bookingViews } from '../bookings/views';
import { auditAdmin } from '../audit/audit';
import { notify } from '../notifications/service';
import { iso, membershipQuery, toMembership } from './queries';

const DOWNLOAD_TTL_SECONDS = 60;

/*
 * Admin side of residents & households (ADM-05, ADM-06). Every query runs with
 * the admin's claims, so RLS limits rows to the admin's clusters (global-scope
 * admins also see residents who have not registered a flat yet).
 */
export class ResidentAdminService {
  constructor(
    private readonly db: Database,
    private readonly storage: StorageAdapter,
  ) {}

  private tx<T>(actor: AdminActor, fn: (trx: Tx) => Promise<T>) {
    return withTx(this.db, toDbClaims(actor), fn);
  }

  // ------------------------------------------------------------- residents

  async list(actor: AdminActor, p: { limit: number; cursor?: string | undefined; q?: string | undefined; status?: string | undefined; communityId?: string | undefined }) {
    return this.tx(actor, async (trx) => {
      const cursor = decodeCursor(p.cursor);
      let q = trx.selectFrom('app.resident_profiles as p').selectAll('p');
      if (p.q) {
        const pattern = likeContains(p.q);
        q = q.where((eb) => eb.or([eb('p.phone', 'ilike', pattern), eb('p.full_name', 'ilike', pattern)]));
      }
      if (p.status) q = q.where('p.status', '=', p.status as 'ACTIVE' | 'SUSPENDED');
      if (p.communityId) {
        const communityId = p.communityId;
        q = q.where((eb) =>
          eb.exists(
            eb
              .selectFrom('app.residence_memberships as m')
              .whereRef('m.resident_id', '=', 'p.id')
              .where('m.community_id', '=', communityId)
              .select(sql`1`.as('one')),
          ),
        );
      }
      if (cursor) {
        q = q.where((eb) =>
          eb.or([eb('p.created_at', '<', new Date(cursor.v)), eb.and([eb('p.created_at', '=', new Date(cursor.v)), eb('p.id', '<', cursor.id)])]),
        );
      }
      const rows = await q.orderBy('p.created_at', 'desc').orderBy('p.id', 'desc').limit(p.limit + 1).execute();
      const page = toPage(rows, p.limit, (r) => ({ v: new Date(r.created_at).toISOString(), id: r.id }));
      const ids = page.items.map((r) => r.id);
      const active = ids.length
        ? await membershipQuery(trx).where('m.resident_id', 'in', ids).where('m.status', 'in', ['PENDING', 'VERIFIED']).execute()
        : [];
      const items: AdminResident[] = page.items.map((r) => {
        const m = active.find((x) => x.resident_id === r.id);
        return {
          id: r.id,
          phone: r.phone,
          fullName: r.full_name,
          email: r.email,
          status: r.status,
          membership: m ? toMembership(m) : null,
          createdAt: iso(r.created_at)!,
          version: r.version,
        };
      });
      return { items, nextCursor: page.nextCursor };
    });
  }

  async detail(actor: AdminActor, residentId: string): Promise<AdminResidentDetail> {
    return this.tx(actor, (trx) => this.loadDetail(trx, residentId));
  }

  private async loadDetail(trx: Tx, residentId: string): Promise<AdminResidentDetail> {
    const p = await trx.selectFrom('app.resident_profiles').selectAll().where('id', '=', residentId).executeTakeFirst();
    if (!p) throw notFound('Resident');
    const memberships = await membershipQuery(trx).where('m.resident_id', '=', residentId).orderBy('m.created_at', 'desc').execute();
    const open = await trx
      .selectFrom('app.support_tickets')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('resident_id', '=', residentId)
      .where('status', 'not in', ['RESOLVED', 'CLOSED'])
      .executeTakeFirstOrThrow();
    const active = memberships.find((m) => m.status === 'PENDING' || m.status === 'VERIFIED');
    return {
      id: p.id,
      phone: p.phone,
      fullName: p.full_name,
      email: p.email,
      status: p.status,
      membership: active ? toMembership(active) : null,
      memberships: memberships.map(toMembership),
      openTickets: open.n,
      createdAt: iso(p.created_at)!,
      version: p.version,
    };
  }

  async setStatus(actor: AdminActor, requestId: string, residentId: string, input: SetResidentStatusInput) {
    return this.tx(actor, async (trx) => {
      const updated = await trx
        .updateTable('app.resident_profiles')
        .set({ status: input.status })
        .where('id', '=', residentId)
        .where('version', '=', input.version)
        .returning('id')
        .executeTakeFirst();
      if (!updated) {
        const exists = await trx.selectFrom('app.resident_profiles').select('id').where('id', '=', residentId).executeTakeFirst();
        throw exists ? versionConflict() : notFound('Resident');
      }
      await auditAdmin(trx, actor, requestId, {
        action: input.status === 'SUSPENDED' ? 'resident.suspended' : 'resident.reactivated',
        targetType: 'resident',
        targetId: residentId,
        reason: input.reason,
      });
      return this.loadDetail(trx, residentId);
    });
  }

  /**
   * ADM-05: edit a resident's contact details (name, email). The phone number is
   * the sign-in identity and is never changed here. Optimistic concurrency on
   * `version`; audited with before/after.
   */
  async update(actor: AdminActor, requestId: string, residentId: string, input: AdminUpdateResidentInput): Promise<AdminResidentDetail> {
    return this.tx(actor, async (trx) => {
      const before = await trx.selectFrom('app.resident_profiles').select(['id', 'full_name', 'email', 'version']).where('id', '=', residentId).forUpdate().executeTakeFirst();
      if (!before) throw notFound('Resident');
      if (before.version !== input.version) throw versionConflict();
      const updated = await trx
        .updateTable('app.resident_profiles')
        .set({
          ...(input.fullName !== undefined ? { full_name: input.fullName } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
        })
        .where('id', '=', residentId)
        .where('version', '=', input.version)
        .returning(['full_name', 'email'])
        .executeTakeFirst();
      if (!updated) throw versionConflict();
      await auditAdmin(trx, actor, requestId, {
        action: 'resident.updated',
        targetType: 'resident',
        targetId: residentId,
        before: { fullName: before.full_name, email: before.email },
        after: { fullName: updated.full_name, email: updated.email },
      });
      return this.loadDetail(trx, residentId);
    });
  }

  /**
   * ADM-05: the resident's bookings and subscriptions (plan, services, status,
   * amounts, community/flat), newest first. RLS limits rows to the admin's clusters.
   */
  async bookings(actor: AdminActor, residentId: string, p: { limit: number; cursor?: string | undefined; status?: string | undefined }) {
    return this.tx(actor, async (trx) => {
      const exists = await trx.selectFrom('app.resident_profiles').select('id').where('id', '=', residentId).executeTakeFirst();
      if (!exists) throw notFound('Resident');
      const c = decodeCursor(p.cursor);
      const rows = await bookingViews(trx, { residentId, status: p.status, limit: p.limit + 1, before: c ? { at: c.v, id: c.id } : undefined });
      const page = toPage(rows, p.limit, (r) => ({ v: r.createdAt, id: r.id }));
      const ids = page.items.map((b) => b.id);
      const snaps = ids.length
        ? await trx
            .selectFrom('app.bookings as b')
            .innerJoin('app.booking_terms_snapshots as t', 't.id', 'b.terms_snapshot_id')
            .select(['b.id', 't.plan_snapshot'])
            .where('b.id', 'in', ids)
            .execute()
        : [];
      const services = new Map(
        snaps.map((x) => {
          const comps = ((x.plan_snapshot as { components?: { serviceName?: string }[] } | null)?.components ?? [])
            .map((cmp) => cmp.serviceName)
            .filter((n): n is string => typeof n === 'string' && n.length > 0);
          return [x.id, [...new Set(comps)]];
        }),
      );
      // bookingViews returns the admin shape (resident, flat, version) for every row.
      const items: ResidentBookingAdmin[] = (page.items as AdminBooking[]).map((b) => ({ ...b, serviceNames: services.get(b.id) ?? [] }));
      return { items, nextCursor: page.nextCursor };
    });
  }

  // --------------------------------------------------- residence verification

  async verifications(actor: AdminActor, p: { decision: 'PENDING' | 'APPROVED' | 'REJECTED'; limit: number }): Promise<VerificationRequest[]> {
    return this.tx(actor, async (trx) => {
      let q = trx
        .selectFrom('app.residence_verification_requests as v')
        .innerJoin('app.documents as d', 'd.id', 'v.document_id')
        .innerJoin('app.residence_memberships as m', 'm.id', 'v.membership_id')
        .innerJoin('app.resident_profiles as p', 'p.id', 'm.resident_id')
        .select([
          'v.id', 'v.decision', 'v.reason', 'v.created_at', 'v.reviewed_at', 'v.membership_id',
          'd.id as doc_id', 'd.doc_type', 'd.file_name', 'd.status as doc_status',
          'p.id as resident_id', 'p.full_name', 'p.phone', 'm.flat_id',
        ])
        .where('v.decision', '=', p.decision);
      // Requests appear in the queue only once the document is uploaded.
      if (p.decision === 'PENDING') q = q.where('d.status', '=', 'UPLOADED');
      const rows = await q.orderBy('v.created_at', p.decision === 'PENDING' ? 'asc' : 'desc').limit(p.limit).execute();
      if (rows.length === 0) return [];
      const memberships = await membershipQuery(trx).where('m.id', 'in', rows.map((r) => r.membership_id)).execute();
      const flatsWithPrimary = new Set(
        (
          await trx
            .selectFrom('app.residence_memberships')
            .select('flat_id')
            .where('flat_id', 'in', rows.map((r) => r.flat_id))
            .where('kind', '=', 'PRIMARY')
            .where('status', '=', 'VERIFIED')
            .execute()
        ).map((r) => r.flat_id),
      );
      return rows.map((r) => ({
        id: r.id,
        decision: r.decision,
        reason: r.reason,
        createdAt: iso(r.created_at)!,
        reviewedAt: iso(r.reviewed_at as Date | null),
        resident: { id: r.resident_id, fullName: r.full_name, phone: r.phone },
        membership: toMembership(memberships.find((m) => m.id === r.membership_id)!),
        document: { id: r.doc_id, docType: r.doc_type, fileName: r.file_name, uploaded: r.doc_status === 'UPLOADED' },
        flatHasPrimary: flatsWithPrimary.has(r.flat_id),
      }));
    });
  }

  private async lockPending(trx: Tx, id: string) {
    const v = await trx
      .selectFrom('app.residence_verification_requests as v')
      .innerJoin('app.documents as d', 'd.id', 'v.document_id')
      .innerJoin('app.residence_memberships as m', 'm.id', 'v.membership_id')
      .select(['v.id', 'v.decision', 'v.membership_id', 'd.status as doc_status', 'm.status as membership_status', 'm.flat_id', 'm.resident_id'])
      .where('v.id', '=', id)
      .forUpdate('v')
      .executeTakeFirst();
    if (!v) throw notFound('Verification request');
    if (v.decision !== 'PENDING') throw businessRule('This request has already been decided');
    return v;
  }

  /** Approves a flat registration. The first verified resident of a flat becomes its Primary Resident. */
  async approveVerification(actor: AdminActor, requestId: string, id: string) {
    return this.tx(actor, async (trx) => {
      const v = await this.lockPending(trx, id);
      if (v.doc_status !== 'UPLOADED') throw businessRule('The resident has not uploaded the document yet');
      if (v.membership_status !== 'PENDING') throw businessRule('This registration is no longer pending');
      const primary = await trx
        .selectFrom('app.residence_memberships')
        .select('id')
        .where('flat_id', '=', v.flat_id)
        .where('kind', '=', 'PRIMARY')
        .where('status', '=', 'VERIFIED')
        .executeTakeFirst();
      if (primary) {
        // Policy for a second unrelated registrant is OPEN; the Primary can add them as family.
        throw businessRule('This flat already has a Primary Resident. Reject this request; the Primary Resident can add this person as a family member.');
      }
      await trx
        .updateTable('app.residence_memberships')
        .set({ status: 'VERIFIED', verified_at: sql`now()`, verified_by: actor.id })
        .where('id', '=', v.membership_id)
        .execute();
      await trx
        .updateTable('app.residence_verification_requests')
        .set({ decision: 'APPROVED', reviewed_by: actor.id, reviewed_at: sql`now()` })
        .where('id', '=', id)
        .execute();
      await auditAdmin(trx, actor, requestId, {
        action: 'residence.verified',
        targetType: 'residence_membership',
        targetId: v.membership_id,
        after: { residentId: v.resident_id, flatId: v.flat_id, kind: 'PRIMARY' },
      });
      await notify(trx, 'residence.verified', v.resident_id, {}, `residence.verified:${id}`);
      return { decision: 'APPROVED' as const };
    });
  }

  async rejectVerification(actor: AdminActor, requestId: string, id: string, reason: string) {
    return this.tx(actor, async (trx) => {
      const v = await this.lockPending(trx, id);
      await trx
        .updateTable('app.residence_memberships')
        .set({ status: 'REJECTED', ended_at: sql`now()`, end_reason: reason })
        .where('id', '=', v.membership_id)
        .where('status', '=', 'PENDING')
        .execute();
      await trx
        .updateTable('app.residence_verification_requests')
        .set({ decision: 'REJECTED', reason, reviewed_by: actor.id, reviewed_at: sql`now()` })
        .where('id', '=', id)
        .execute();
      await auditAdmin(trx, actor, requestId, {
        action: 'residence.rejected',
        targetType: 'residence_membership',
        targetId: v.membership_id,
        reason,
      });
      await notify(trx, 'residence.rejected', v.resident_id, {}, `residence.rejected:${id}`);
      return { decision: 'REJECTED' as const };
    });
  }

  /** Short-lived signed URL for a private document; every view is audited. */
  async documentUrl(actor: AdminActor, requestId: string, documentId: string): Promise<DocumentUrl> {
    return this.tx(actor, async (trx) => {
      const doc = await trx.selectFrom('app.documents').select(['id', 'bucket', 'storage_key', 'status']).where('id', '=', documentId).executeTakeFirst();
      if (!doc) throw notFound('Document');
      if (doc.status !== 'UPLOADED') throw businessRule('This document has not been uploaded yet');
      const url = await this.storage.createSignedDownload(doc.bucket, doc.storage_key, DOWNLOAD_TTL_SECONDS);
      await auditAdmin(trx, actor, requestId, { action: 'document.viewed', targetType: 'document', targetId: documentId });
      return { url, expiresInSeconds: DOWNLOAD_TTL_SECONDS };
    });
  }

  // -------------------------------------------------------- family requests

  async familyRequests(actor: AdminActor, p: { status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'; limit: number }): Promise<AdminFamilyRequest[]> {
    return this.tx(actor, async (trx) => {
      const rows = await trx
        .selectFrom('app.family_access_requests as r')
        .innerJoin('app.residence_memberships as m', 'm.id', 'r.primary_membership_id')
        .innerJoin('app.resident_profiles as p', 'p.id', 'm.resident_id')
        .innerJoin('app.flats as f', 'f.id', 'm.flat_id')
        .innerJoin('app.towers as t', 't.id', 'f.tower_id')
        .innerJoin('app.communities as c', 'c.id', 'm.community_id')
        .select([
          'r.id', 'r.full_name', 'r.phone', 'r.relationship', 'r.status', 'r.reason', 'r.created_at', 'r.reviewed_at',
          'r.physical_verification_at', 'p.id as primary_id', 'p.full_name as primary_name', 'p.phone as primary_phone',
          'f.flat_number', 't.name as tower_name', 'c.name as community_name',
        ])
        .where('r.status', '=', p.status)
        .orderBy('r.created_at', p.status === 'PENDING' ? 'asc' : 'desc')
        .limit(p.limit)
        .execute();
      return rows.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        phone: r.phone,
        relationship: r.relationship,
        status: r.status,
        reason: r.reason,
        createdAt: iso(r.created_at)!,
        reviewedAt: iso(r.reviewed_at as Date | null),
        physicalVerificationAt: iso(r.physical_verification_at as Date | null),
        primary: { residentId: r.primary_id, fullName: r.primary_name, phone: r.primary_phone },
        flat: { flatNumber: r.flat_number, towerName: r.tower_name, communityName: r.community_name },
      }));
    });
  }

  async approveFamily(actor: AdminActor, requestId: string, id: string, input: ApproveFamilyInput) {
    return this.tx(actor, async (trx) => {
      const r = await trx
        .selectFrom('app.family_access_requests as r')
        .innerJoin('app.residence_memberships as m', 'm.id', 'r.primary_membership_id')
        .select(['r.id', 'r.status', 'r.phone', 'r.requested_by', 'm.status as primary_status'])
        .where('r.id', '=', id)
        .forUpdate('r')
        .executeTakeFirst();
      if (!r) throw notFound('Family request');
      if (r.status !== 'PENDING') throw businessRule('This request has already been decided');
      if (r.primary_status !== 'VERIFIED') throw businessRule('The Primary Resident’s residence is no longer verified');
      await trx
        .updateTable('app.family_access_requests')
        .set({ status: 'APPROVED', physical_verification_at: sql`now()`, reviewed_by: actor.id, reviewed_at: sql`now()`, reason: input.note ?? null })
        .where('id', '=', id)
        .execute();
      // If the family member already has an account, attach them now; otherwise on first sign-in.
      const attached = await sql<{ n: number }>`select app.attach_approved_family(${r.phone}) as n`.execute(trx);
      await auditAdmin(trx, actor, requestId, {
        action: 'family.approved',
        targetType: 'family_access_request',
        targetId: id,
        reason: input.note ?? null,
        after: { physicalVerificationRecorded: true, attachedNow: (attached.rows[0]?.n ?? 0) > 0 },
      });
      await notify(trx, 'family.approved', r.requested_by, {}, `family.approved:${id}`);
      const member = await trx.selectFrom('app.resident_profiles').select('id').where('phone', '=', r.phone).executeTakeFirst();
      if (member && (attached.rows[0]?.n ?? 0) > 0) await notify(trx, 'family.access_granted', member.id, {}, `family.access_granted:${id}`);
      return { status: 'APPROVED' as const, attachedNow: (attached.rows[0]?.n ?? 0) > 0 };
    });
  }

  async rejectFamily(actor: AdminActor, requestId: string, id: string, reason: string) {
    return this.tx(actor, async (trx) => {
      const r = await trx
        .updateTable('app.family_access_requests')
        .set({ status: 'REJECTED', reason, reviewed_by: actor.id, reviewed_at: sql`now()` })
        .where('id', '=', id)
        .where('status', '=', 'PENDING')
        .returning(['id', 'requested_by'])
        .executeTakeFirst();
      if (!r) {
        const exists = await trx.selectFrom('app.family_access_requests').select('id').where('id', '=', id).executeTakeFirst();
        throw exists ? businessRule('This request has already been decided') : notFound('Family request');
      }
      await auditAdmin(trx, actor, requestId, { action: 'family.rejected', targetType: 'family_access_request', targetId: id, reason });
      await notify(trx, 'family.rejected', r.requested_by, {}, `family.rejected:${id}`);
      return { status: 'REJECTED' as const };
    });
  }
}
