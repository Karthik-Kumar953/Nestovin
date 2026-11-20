import type { Membership } from '@nestovin/contracts';
import type { Database, Tx } from '../../db/database';

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

/** Memberships joined with flat / tower / community names. RLS applies (Tier A). */
export function membershipQuery(trx: Database | Tx) {
  return trx
    .selectFrom('app.residence_memberships as m')
    .innerJoin('app.flats as f', 'f.id', 'm.flat_id')
    .innerJoin('app.towers as t', 't.id', 'f.tower_id')
    .innerJoin('app.communities as c', 'c.id', 'm.community_id')
    .select([
      'm.id',
      'm.resident_id',
      'm.kind',
      'm.occupancy',
      'm.status',
      'm.flat_id',
      'm.community_id',
      'm.cluster_id',
      'm.primary_membership_id',
      'm.verified_at',
      'm.created_at',
      'f.flat_number',
      'f.residence_category_id',
      't.name as tower_name',
      'c.name as community_name',
    ]);
}

export type MembershipRow = Awaited<ReturnType<ReturnType<typeof membershipQuery>['executeTakeFirstOrThrow']>>;

export function toMembership(r: MembershipRow): Membership {
  return {
    id: r.id,
    residentId: r.resident_id,
    kind: r.kind,
    occupancy: r.occupancy,
    status: r.status,
    flatId: r.flat_id,
    flatNumber: r.flat_number,
    towerName: r.tower_name,
    communityId: r.community_id,
    communityName: r.community_name,
    verifiedAt: iso(r.verified_at as Date | null),
    createdAt: iso(r.created_at)!,
  };
}

/** The resident's active (PENDING or VERIFIED) membership, if any. */
export function activeMembership(trx: Tx, residentId: string) {
  return membershipQuery(trx)
    .where('m.resident_id', '=', residentId)
    .where('m.status', 'in', ['PENDING', 'VERIFIED'])
    .executeTakeFirst();
}

export { iso };
