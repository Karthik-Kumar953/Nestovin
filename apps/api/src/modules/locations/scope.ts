import type { Database, Tx } from '../../db/database';
import { inScope, type AdminActor } from '../../auth/permissions';
import { notFound } from '../../lib/errors';

export interface VisibleCommunity {
  id: string;
  status: 'DRAFT' | 'IMPORTED' | 'CONFIGURED' | 'ACTIVE' | 'INACTIVE';
  clusterId: string | null;
  defaultOperatingMode: 'DEMAND_LED' | 'CONTINUOUS' | null;
}

/**
 * Loads a community the admin may see: its CURRENT cluster must be in the
 * admin's scope (unassigned communities: global scope only). Otherwise answers
 * NOT_FOUND so existence is never revealed. Pass `lock` to serialise writers.
 */
export async function visibleCommunity(
  trx: Database | Tx,
  actor: AdminActor,
  communityId: string,
  opts: { lock?: boolean } = {},
): Promise<VisibleCommunity> {
  let q = trx
    .selectFrom('app.communities as c')
    .leftJoin('app.cluster_community_memberships as m', (j) =>
      j.onRef('m.community_id', '=', 'c.id').on('m.effective_to', 'is', null),
    )
    .select(['c.id', 'c.status', 'c.default_operating_mode', 'm.cluster_id'])
    .where('c.id', '=', communityId);
  if (opts.lock) q = q.forUpdate('c');
  const row = await q.executeTakeFirst();
  if (!row || !inScope(actor, row.cluster_id)) throw notFound('Community');
  return {
    id: row.id,
    status: row.status,
    clusterId: row.cluster_id,
    defaultOperatingMode: row.default_operating_mode,
  };
}
