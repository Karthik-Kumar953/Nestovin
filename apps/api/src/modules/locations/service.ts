import { sql } from 'kysely';
import type {
  AssignCommunityClusterInput,
  City,
  Cluster,
  ClusterMembership,
  Community,
  CreateCityInput,
  CreateClusterInput,
  CreateCommunityInput,
  CreateFlatInput,
  CreateTowerInput,
  ExpansionVoteAggregate,
  Flat,
  Tower,
  UpdateCityInput,
  UpdateClusterInput,
  UpdateCommunityInput,
  UpdateFlatInput,
  UpdateTowerInput,
} from '@nestovin/contracts';
import type { Database, Tx } from '../../db/database';
import { withTx } from '../../db/database';
import { hasGlobalScope, inScope, scopeClusterIds, toDbClaims, type AdminActor } from '../../auth/permissions';
import { businessRule, forbidden, fromPgError, notFound, versionConflict } from '../../lib/errors';
import { decodeCursor, likeContains, toPage } from '../../lib/pagination';
import { auditAdmin } from '../audit/audit';

/*
 * Location master data (ADM-03).
 * Scope rules (ADR-001):
 *  - Cities and clusters are created/edited by global-scope admins only.
 *  - A community is visible to an admin if its CURRENT cluster is in the admin's
 *    scope. Unassigned communities are visible to global scope only and never
 *    inherit anyone's scope.
 *  - Towers and flats follow their community.
 *  - Out-of-scope records answer NOT_FOUND (existence is never revealed).
 *  - Children cannot be created under inactive parents; parents with active
 *    children cannot be deactivated. Nothing is hard-deleted.
 */

const iso = (d: Date) => d.toISOString();
const num = (v: string | null) => (v === null ? null : Number(v));
const geo = (lat: string | null, lng: string | null) =>
  lat === null || lng === null ? null : { lat: Number(lat), lng: Number(lng) };

const UNIQUE_FIELDS = {
  cities_name_state_uq: { path: 'name', message: 'This city already exists in this state' },
  clusters_code_uq: { path: 'code', message: 'This cluster code is already used' },
  clusters_name_uq: { path: 'name', message: 'A cluster with this name already exists' },
  communities_code_uq: { path: 'code', message: 'This community code is already used' },
  communities_city_name_uq: { path: 'name', message: 'A community with this name already exists in this city' },
  towers_community_name_uq: { path: 'name', message: 'A tower with this name already exists in this community' },
  flats_tower_number_uq: { path: 'flatNumber', message: 'This flat number already exists in this tower' },
};

function mapPg(err: unknown): never {
  throw fromPgError(err, UNIQUE_FIELDS) ?? err;
}

export interface ListParams {
  limit: number;
  cursor?: string | undefined;
  q?: string | undefined;
  status?: string | undefined;
}

export class LocationService {
  constructor(private readonly db: Database) {}

  private tx<T>(actor: AdminActor, fn: (trx: Tx) => Promise<T>) {
    return withTx(this.db, toDbClaims(actor), fn);
  }

  private requireGlobal(actor: AdminActor) {
    if (!hasGlobalScope(actor)) throw forbidden('Only admins with access to all clusters can do this');
  }

  // ---------------------------------------------------------------- helpers

  /** Current cluster of a community, or throws NOT_FOUND if missing or out of scope. */
  private async visibleCommunity(trx: Tx, actor: AdminActor, communityId: string) {
    const row = await trx
      .selectFrom('app.communities as c')
      .leftJoin('app.cluster_community_memberships as m', (j) =>
        j.onRef('m.community_id', '=', 'c.id').on('m.effective_to', 'is', null),
      )
      .select(['c.id', 'c.status', 'm.cluster_id'])
      .where('c.id', '=', communityId)
      .executeTakeFirst();
    if (!row || !inScope(actor, row.cluster_id)) throw notFound('Community');
    return row;
  }

  private async visibleTower(trx: Tx, actor: AdminActor, towerId: string) {
    const tower = await trx
      .selectFrom('app.towers')
      .select(['id', 'community_id', 'status'])
      .where('id', '=', towerId)
      .executeTakeFirst();
    if (!tower) throw notFound('Tower');
    try {
      await this.visibleCommunity(trx, actor, tower.community_id);
    } catch {
      throw notFound('Tower');
    }
    return tower;
  }

  // ----------------------------------------------------------------- cities

  async listCities(actor: AdminActor, p: ListParams) {
    const cursor = decodeCursor(p.cursor);
    const clusters = scopeClusterIds(actor);
    let q = this.db.selectFrom('app.cities as ci').selectAll('ci');
    if (clusters !== 'all') {
      if (clusters.length === 0) return { items: [], nextCursor: null };
      // Cluster-scoped admins only see cities that contain a community in their scope.
      q = q.where((eb) =>
        eb.exists(
          eb
            .selectFrom('app.communities as co')
            .innerJoin('app.cluster_community_memberships as m', 'm.community_id', 'co.id')
            .whereRef('co.city_id', '=', 'ci.id')
            .where('m.effective_to', 'is', null)
            .where('m.cluster_id', 'in', [...clusters])
            .select(sql`1`.as('one')),
        ),
      );
    }
    if (p.q) q = q.where('ci.name', 'ilike', likeContains(p.q));
    if (p.status) q = q.where('ci.status', '=', p.status as 'ACTIVE' | 'INACTIVE');
    if (cursor) {
      q = q.where((eb) =>
        eb.or([
          eb(sql`lower(ci.name)`, '>', cursor.v),
          eb.and([eb(sql`lower(ci.name)`, '=', cursor.v), eb('ci.id', '>', cursor.id)]),
        ]),
      );
    }
    const rows = await q.orderBy(sql`lower(ci.name)`).orderBy('ci.id').limit(p.limit + 1).execute();
    return toPage(rows.map(toCity), p.limit, (c) => ({ v: c.name.toLowerCase(), id: c.id }));
  }

  async createCity(actor: AdminActor, requestId: string, input: CreateCityInput): Promise<City> {
    this.requireGlobal(actor);
    return this.tx(actor, async (trx) => {
      const row = await trx
        .insertInto('app.cities')
        .values({ name: input.name, state: input.state })
        .returningAll()
        .executeTakeFirstOrThrow()
        .catch(mapPg);
      const city = toCity(row);
      await auditAdmin(trx, actor, requestId, { action: 'city.created', targetType: 'city', targetId: city.id, after: city });
      return city;
    });
  }

  async updateCity(actor: AdminActor, requestId: string, id: string, input: UpdateCityInput): Promise<City> {
    this.requireGlobal(actor);
    return this.tx(actor, async (trx) => {
      const before = await trx.selectFrom('app.cities').selectAll().where('id', '=', id).executeTakeFirst();
      if (!before) throw notFound('City');
      if (input.status === 'INACTIVE' && before.status === 'ACTIVE') {
        const active = await trx
          .selectFrom('app.communities')
          .select(sql<number>`count(*)::int`.as('n'))
          .where('city_id', '=', id)
          .where('status', '<>', 'INACTIVE')
          .executeTakeFirstOrThrow();
        if (active.n > 0) throw businessRule('Deactivate or move the communities in this city first');
      }
      const row = await trx
        .updateTable('app.cities')
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.state !== undefined ? { state: input.state } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        })
        .where('id', '=', id)
        .where('version', '=', input.version)
        .returningAll()
        .executeTakeFirst()
        .catch(mapPg);
      if (!row) throw versionConflict();
      const city = toCity(row);
      await auditAdmin(trx, actor, requestId, {
        action: 'city.updated',
        targetType: 'city',
        targetId: id,
        before: toCity(before),
        after: city,
      });
      return city;
    });
  }

  // --------------------------------------------------------------- clusters

  private clusterQuery(trx: Database | Tx) {
    return trx
      .selectFrom('app.clusters as cl')
      .selectAll('cl')
      .select((eb) =>
        eb
          .selectFrom('app.cluster_community_memberships as m')
          .whereRef('m.cluster_id', '=', 'cl.id')
          .where('m.effective_to', 'is', null)
          .select(sql<number>`count(*)::int`.as('n'))
          .as('community_count'),
      );
  }

  async listClusters(actor: AdminActor, p: ListParams) {
    const cursor = decodeCursor(p.cursor);
    const clusters = scopeClusterIds(actor);
    let q = this.clusterQuery(this.db);
    if (clusters !== 'all') {
      if (clusters.length === 0) return { items: [], nextCursor: null };
      q = q.where('cl.id', 'in', [...clusters]);
    }
    if (p.q) {
      const pattern = likeContains(p.q);
      q = q.where((eb) => eb.or([eb('cl.name', 'ilike', pattern), eb('cl.code', 'ilike', pattern)]));
    }
    if (p.status) q = q.where('cl.status', '=', p.status as 'ACTIVE' | 'INACTIVE');
    if (cursor) {
      q = q.where((eb) =>
        eb.or([
          eb(sql`lower(cl.name)`, '>', cursor.v),
          eb.and([eb(sql`lower(cl.name)`, '=', cursor.v), eb('cl.id', '>', cursor.id)]),
        ]),
      );
    }
    const rows = await q.orderBy(sql`lower(cl.name)`).orderBy('cl.id').limit(p.limit + 1).execute();
    return toPage(rows.map(toCluster), p.limit, (c) => ({ v: c.name.toLowerCase(), id: c.id }));
  }

  async createCluster(actor: AdminActor, requestId: string, input: CreateClusterInput): Promise<Cluster> {
    this.requireGlobal(actor);
    return this.tx(actor, async (trx) => {
      const inserted = await trx
        .insertInto('app.clusters')
        .values({ name: input.name, code: input.code, description: input.description ?? null })
        .returning('id')
        .executeTakeFirstOrThrow()
        .catch(mapPg);
      const cluster = toCluster(await this.clusterQuery(trx).where('cl.id', '=', inserted.id).executeTakeFirstOrThrow());
      await auditAdmin(trx, actor, requestId, { action: 'cluster.created', targetType: 'cluster', targetId: cluster.id, after: cluster });
      return cluster;
    });
  }

  async updateCluster(actor: AdminActor, requestId: string, id: string, input: UpdateClusterInput): Promise<Cluster> {
    this.requireGlobal(actor);
    return this.tx(actor, async (trx) => {
      const before = await this.clusterQuery(trx).where('cl.id', '=', id).executeTakeFirst();
      if (!before) throw notFound('Cluster');
      if (input.status === 'INACTIVE' && before.status === 'ACTIVE' && (before.community_count ?? 0) > 0) {
        throw businessRule('Move this cluster’s communities to another cluster before deactivating it');
      }
      const updated = await trx
        .updateTable('app.clusters')
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        })
        .where('id', '=', id)
        .where('version', '=', input.version)
        .returning('id')
        .executeTakeFirst()
        .catch(mapPg);
      if (!updated) throw versionConflict();
      const cluster = toCluster(await this.clusterQuery(trx).where('cl.id', '=', id).executeTakeFirstOrThrow());
      await auditAdmin(trx, actor, requestId, {
        action: 'cluster.updated',
        targetType: 'cluster',
        targetId: id,
        before: toCluster(before),
        after: cluster,
      });
      return cluster;
    });
  }

  // ------------------------------------------------------------ communities

  private communityQuery(trx: Database | Tx) {
    return trx
      .selectFrom('app.communities as c')
      .innerJoin('app.cities as ci', 'ci.id', 'c.city_id')
      .leftJoin('app.cluster_community_memberships as m', (j) =>
        j.onRef('m.community_id', '=', 'c.id').on('m.effective_to', 'is', null),
      )
      .leftJoin('app.clusters as cl', 'cl.id', 'm.cluster_id')
      .selectAll('c')
      .select(['ci.name as city_name', 'm.cluster_id as cluster_id', 'cl.name as cluster_name']);
  }

  async listCommunities(
    actor: AdminActor,
    p: ListParams & { cityId?: string | undefined; clusterId?: string | undefined },
  ) {
    const cursor = decodeCursor(p.cursor);
    const clusters = scopeClusterIds(actor);
    let q = this.communityQuery(this.db);
    if (clusters !== 'all') {
      if (clusters.length === 0) return { items: [], nextCursor: null };
      q = q.where('m.cluster_id', 'in', [...clusters]);
    }
    if (p.cityId) q = q.where('c.city_id', '=', p.cityId);
    if (p.clusterId) q = q.where('m.cluster_id', '=', p.clusterId);
    if (p.q) {
      const pattern = likeContains(p.q);
      q = q.where((eb) => eb.or([eb('c.name', 'ilike', pattern), eb('c.code', 'ilike', pattern)]));
    }
    if (p.status) q = q.where('c.status', '=', p.status as Community['status']);
    if (cursor) {
      q = q.where((eb) =>
        eb.or([
          eb(sql`lower(c.name)`, '>', cursor.v),
          eb.and([eb(sql`lower(c.name)`, '=', cursor.v), eb('c.id', '>', cursor.id)]),
        ]),
      );
    }
    const rows = await q.orderBy(sql`lower(c.name)`).orderBy('c.id').limit(p.limit + 1).execute();
    return toPage(rows.map(toCommunity), p.limit, (c) => ({ v: c.name.toLowerCase(), id: c.id }));
  }

  async getCommunity(actor: AdminActor, id: string): Promise<Community> {
    const row = await this.communityQuery(this.db).where('c.id', '=', id).executeTakeFirst();
    if (!row || !inScope(actor, row.cluster_id)) throw notFound('Community');
    return toCommunity(row);
  }

  async createCommunity(actor: AdminActor, requestId: string, input: CreateCommunityInput): Promise<Community> {
    if (!hasGlobalScope(actor) && !input.clusterId) {
      throw businessRule('Choose one of your clusters for this community');
    }
    if (input.clusterId && !inScope(actor, input.clusterId)) throw notFound('Cluster');

    return this.tx(actor, async (trx) => {
      const city = await trx.selectFrom('app.cities').select(['id', 'status']).where('id', '=', input.cityId).executeTakeFirst();
      if (!city) throw notFound('City');
      if (city.status !== 'ACTIVE') throw businessRule('This city is inactive');

      if (input.clusterId) {
        const cluster = await trx.selectFrom('app.clusters').select(['status']).where('id', '=', input.clusterId).executeTakeFirst();
        if (!cluster) throw notFound('Cluster');
        if (cluster.status !== 'ACTIVE') throw businessRule('This cluster is inactive');
      }

      const inserted = await trx
        .insertInto('app.communities')
        .values({
          city_id: input.cityId,
          name: input.name,
          code: input.code,
          address_line: input.addressLine ?? null,
          postal_code: input.postalCode ?? null,
          location_lat: input.location?.lat ?? null,
          location_lng: input.location?.lng ?? null,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
        .catch(mapPg);

      if (input.clusterId) {
        await trx
          .insertInto('app.cluster_community_memberships')
          .values({
            cluster_id: input.clusterId,
            community_id: inserted.id,
            reason: 'Initial cluster assignment',
            changed_by: actor.id,
          })
          .execute();
      }

      const community = toCommunity(await this.communityQuery(trx).where('c.id', '=', inserted.id).executeTakeFirstOrThrow());
      await auditAdmin(trx, actor, requestId, {
        action: 'community.created',
        targetType: 'community',
        targetId: community.id,
        after: community,
      });
      return community;
    });
  }

  async updateCommunity(actor: AdminActor, requestId: string, id: string, input: UpdateCommunityInput): Promise<Community> {
    return this.tx(actor, async (trx) => {
      const beforeRow = await this.communityQuery(trx).where('c.id', '=', id).executeTakeFirst();
      if (!beforeRow || !inScope(actor, beforeRow.cluster_id)) throw notFound('Community');
      const before = toCommunity(beforeRow);

      // Only deactivation happens here. Activation (and re-activation) goes through
      // the Community Setup checklist: POST /communities/:id/activate.
      if (input.status === 'INACTIVE' && before.status === 'INACTIVE') {
        throw businessRule('This community is already inactive');
      }

      const updated = await trx
        .updateTable('app.communities')
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.addressLine !== undefined ? { address_line: input.addressLine } : {}),
          ...(input.postalCode !== undefined ? { postal_code: input.postalCode } : {}),
          ...(input.location !== undefined ? { location_lat: input.location.lat, location_lng: input.location.lng } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        })
        .where('id', '=', id)
        .where('version', '=', input.version)
        .returning('id')
        .executeTakeFirst()
        .catch(mapPg);
      if (!updated) throw versionConflict();

      const community = toCommunity(await this.communityQuery(trx).where('c.id', '=', id).executeTakeFirstOrThrow());
      await auditAdmin(trx, actor, requestId, {
        action: 'community.updated',
        targetType: 'community',
        targetId: id,
        before,
        after: community,
      });
      return community;
    });
  }

  /**
   * Assign or move a community to a cluster. The admin needs scope over both the
   * current cluster (if any) and the target. The old membership is closed and a
   * new one opened, in one transaction.
   */
  async assignCluster(actor: AdminActor, requestId: string, communityId: string, input: AssignCommunityClusterInput): Promise<Community> {
    return this.tx(actor, async (trx) => {
      const current = await this.visibleCommunity(trx, actor, communityId);
      if (!inScope(actor, input.clusterId)) throw notFound('Cluster');
      if (current.cluster_id === input.clusterId) throw businessRule('The community is already in this cluster');

      const target = await trx.selectFrom('app.clusters').select(['status']).where('id', '=', input.clusterId).executeTakeFirst();
      if (!target) throw notFound('Cluster');
      if (target.status !== 'ACTIVE') throw businessRule('This cluster is inactive');

      // Lock the community row so concurrent moves serialise.
      await trx.selectFrom('app.communities').select('id').where('id', '=', communityId).forUpdate().execute();

      if (current.cluster_id) {
        await trx
          .updateTable('app.cluster_community_memberships')
          .set({ effective_to: sql`now()` })
          .where('community_id', '=', communityId)
          .where('effective_to', 'is', null)
          .execute();
      }
      await trx
        .insertInto('app.cluster_community_memberships')
        .values({
          cluster_id: input.clusterId,
          community_id: communityId,
          reason: input.reason,
          changed_by: actor.id,
          // Start strictly after the closed row so the period check always holds.
          effective_from: sql`now() + interval '1 microsecond'`,
        })
        .execute();

      const community = toCommunity(await this.communityQuery(trx).where('c.id', '=', communityId).executeTakeFirstOrThrow());
      await auditAdmin(trx, actor, requestId, {
        action: 'community.cluster_assigned',
        targetType: 'community',
        targetId: communityId,
        reason: input.reason,
        before: { clusterId: current.cluster_id },
        after: { clusterId: input.clusterId },
      });
      return community;
    });
  }

  async membershipHistory(actor: AdminActor, communityId: string): Promise<ClusterMembership[]> {
    return this.tx(actor, async (trx) => {
      await this.visibleCommunity(trx, actor, communityId);
      const rows = await trx
        .selectFrom('app.cluster_community_memberships as m')
        .innerJoin('app.clusters as cl', 'cl.id', 'm.cluster_id')
        .select([
          'm.id',
          'm.cluster_id',
          'cl.name as cluster_name',
          'm.community_id',
          'm.effective_from',
          'm.effective_to',
          'm.reason',
          'm.changed_by',
        ])
        .where('m.community_id', '=', communityId)
        .orderBy('m.effective_from', 'desc')
        .execute();
      return rows.map((r) => ({
        id: r.id,
        clusterId: r.cluster_id,
        clusterName: r.cluster_name,
        communityId: r.community_id,
        effectiveFrom: iso(r.effective_from),
        effectiveTo: r.effective_to ? iso(new Date(r.effective_to)) : null,
        reason: r.reason,
        changedBy: r.changed_by ?? '',
      }));
    });
  }

  // ----------------------------------------------------------------- towers

  private towerQuery(trx: Database | Tx) {
    return trx
      .selectFrom('app.towers as t')
      .selectAll('t')
      .select((eb) =>
        eb
          .selectFrom('app.flats as f')
          .whereRef('f.tower_id', '=', 't.id')
          .where('f.status', '=', 'ACTIVE')
          .select(sql<number>`count(*)::int`.as('n'))
          .as('flat_count'),
      );
  }

  async listTowers(actor: AdminActor, communityId: string, p: ListParams) {
    return this.tx(actor, async (trx) => {
      await this.visibleCommunity(trx, actor, communityId);
      const cursor = decodeCursor(p.cursor);
      let q = this.towerQuery(trx).where('t.community_id', '=', communityId);
      if (p.q) q = q.where('t.name', 'ilike', likeContains(p.q));
      if (p.status) q = q.where('t.status', '=', p.status as 'ACTIVE' | 'INACTIVE');
      if (cursor) {
        q = q.where((eb) =>
          eb.or([
            eb(sql`lower(t.name)`, '>', cursor.v),
            eb.and([eb(sql`lower(t.name)`, '=', cursor.v), eb('t.id', '>', cursor.id)]),
          ]),
        );
      }
      const rows = await q.orderBy(sql`lower(t.name)`).orderBy('t.id').limit(p.limit + 1).execute();
      return toPage(rows.map(toTower), p.limit, (t) => ({ v: t.name.toLowerCase(), id: t.id }));
    });
  }

  async createTower(actor: AdminActor, requestId: string, input: CreateTowerInput): Promise<Tower> {
    return this.tx(actor, async (trx) => {
      const community = await this.visibleCommunity(trx, actor, input.communityId);
      if (community.status === 'INACTIVE') throw businessRule('This community is inactive');
      const inserted = await trx
        .insertInto('app.towers')
        .values({
          community_id: input.communityId,
          name: input.name,
          floor_count: input.floorCount ?? null,
          location_lat: input.location?.lat ?? null,
          location_lng: input.location?.lng ?? null,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
        .catch(mapPg);
      const tower = toTower(await this.towerQuery(trx).where('t.id', '=', inserted.id).executeTakeFirstOrThrow());
      await auditAdmin(trx, actor, requestId, { action: 'tower.created', targetType: 'tower', targetId: tower.id, after: tower });
      return tower;
    });
  }

  async updateTower(actor: AdminActor, requestId: string, id: string, input: UpdateTowerInput): Promise<Tower> {
    return this.tx(actor, async (trx) => {
      await this.visibleTower(trx, actor, id);
      const beforeRow = await this.towerQuery(trx).where('t.id', '=', id).executeTakeFirstOrThrow();
      if (input.status === 'INACTIVE' && beforeRow.status === 'ACTIVE' && (beforeRow.flat_count ?? 0) > 0) {
        throw businessRule('Deactivate the flats in this tower first');
      }
      const updated = await trx
        .updateTable('app.towers')
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.floorCount !== undefined ? { floor_count: input.floorCount } : {}),
          ...(input.location !== undefined ? { location_lat: input.location.lat, location_lng: input.location.lng } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        })
        .where('id', '=', id)
        .where('version', '=', input.version)
        .returning('id')
        .executeTakeFirst()
        .catch(mapPg);
      if (!updated) throw versionConflict();
      const tower = toTower(await this.towerQuery(trx).where('t.id', '=', id).executeTakeFirstOrThrow());
      await auditAdmin(trx, actor, requestId, {
        action: 'tower.updated',
        targetType: 'tower',
        targetId: id,
        before: toTower(beforeRow),
        after: tower,
      });
      return tower;
    });
  }

  // ------------------------------------------------------------------ flats

  private flatQuery(trx: Database | Tx) {
    return trx
      .selectFrom('app.flats as f')
      .innerJoin('app.towers as t', 't.id', 'f.tower_id')
      .leftJoin('app.residence_categories as rc', 'rc.id', 'f.residence_category_id')
      .selectAll('f')
      .select(['t.name as tower_name', 'rc.label as residence_category_label']);
  }

  /** A flat's category must be an active category of the flat's own community. */
  private async assertCategory(trx: Tx, communityId: string, categoryId: string | null | undefined) {
    if (!categoryId) return;
    const cat = await trx
      .selectFrom('app.residence_categories')
      .select('status')
      .where('id', '=', categoryId)
      .where('community_id', '=', communityId)
      .executeTakeFirst();
    if (!cat) throw notFound('Residence category');
    if (cat.status !== 'ACTIVE') throw businessRule('This residence category is inactive');
  }

  async listFlats(actor: AdminActor, towerId: string, p: ListParams) {
    return this.tx(actor, async (trx) => {
      await this.visibleTower(trx, actor, towerId);
      const cursor = decodeCursor(p.cursor);
      let q = this.flatQuery(trx).where('f.tower_id', '=', towerId);
      if (p.q) q = q.where('f.flat_number', 'ilike', likeContains(p.q));
      if (p.status) q = q.where('f.status', '=', p.status as 'ACTIVE' | 'INACTIVE');
      if (cursor) {
        q = q.where((eb) =>
          eb.or([
            eb(sql`lower(f.flat_number)`, '>', cursor.v),
            eb.and([eb(sql`lower(f.flat_number)`, '=', cursor.v), eb('f.id', '>', cursor.id)]),
          ]),
        );
      }
      const rows = await q.orderBy(sql`lower(f.flat_number)`).orderBy('f.id').limit(p.limit + 1).execute();
      return toPage(rows.map(toFlat), p.limit, (f) => ({ v: f.flatNumber.toLowerCase(), id: f.id }));
    });
  }

  async createFlat(actor: AdminActor, requestId: string, input: CreateFlatInput): Promise<Flat> {
    return this.tx(actor, async (trx) => {
      const tower = await this.visibleTower(trx, actor, input.towerId);
      if (tower.status !== 'ACTIVE') throw businessRule('This tower is inactive');
      await this.assertCategory(trx, tower.community_id, input.residenceCategoryId);
      const inserted = await trx
        .insertInto('app.flats')
        .values({
          tower_id: input.towerId,
          flat_number: input.flatNumber,
          floor: input.floor ?? null,
          bhk_type: input.bhkType ?? null,
          area_sqft: input.areaSqft ?? null,
          residence_category_id: input.residenceCategoryId ?? null,
          occupancy: input.occupancy ?? null,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
        .catch(mapPg);
      const flat = toFlat(await this.flatQuery(trx).where('f.id', '=', inserted.id).executeTakeFirstOrThrow());
      await auditAdmin(trx, actor, requestId, { action: 'flat.created', targetType: 'flat', targetId: flat.id, after: flat });
      return flat;
    });
  }

  async updateFlat(actor: AdminActor, requestId: string, id: string, input: UpdateFlatInput): Promise<Flat> {
    return this.tx(actor, async (trx) => {
      const beforeRow = await this.flatQuery(trx).where('f.id', '=', id).executeTakeFirst();
      if (!beforeRow) throw notFound('Flat');
      try {
        await this.visibleTower(trx, actor, beforeRow.tower_id);
      } catch {
        throw notFound('Flat');
      }
      await this.assertCategory(trx, beforeRow.community_id, input.residenceCategoryId);
      const updated = await trx
        .updateTable('app.flats')
        .set({
          ...(input.flatNumber !== undefined ? { flat_number: input.flatNumber } : {}),
          ...(input.floor !== undefined ? { floor: input.floor } : {}),
          ...(input.bhkType !== undefined ? { bhk_type: input.bhkType } : {}),
          ...(input.areaSqft !== undefined ? { area_sqft: input.areaSqft } : {}),
          ...(input.residenceCategoryId !== undefined ? { residence_category_id: input.residenceCategoryId } : {}),
          ...(input.occupancy !== undefined ? { occupancy: input.occupancy } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        })
        .where('id', '=', id)
        .where('version', '=', input.version)
        .returning('id')
        .executeTakeFirst()
        .catch(mapPg);
      if (!updated) throw versionConflict();
      const flat = toFlat(await this.flatQuery(trx).where('f.id', '=', id).executeTakeFirstOrThrow());
      await auditAdmin(trx, actor, requestId, {
        action: 'flat.updated',
        targetType: 'flat',
        targetId: id,
        before: toFlat(beforeRow),
        after: flat,
      });
      return flat;
    });
  }

  // -------------------------------------------------------- expansion votes

  /** ADM-03A: Super Admin reviews aggregated city/community expansion votes. */
  async voteAggregates(actor: AdminActor): Promise<ExpansionVoteAggregate[]> {
    if (!actor.isSuperAdmin) throw forbidden('Only the Super Admin can review expansion votes');
    const rows = await this.db
      .selectFrom('app.expansion_votes')
      .select([
        'level',
        sql<string>`min(city_name)`.as('city_name'),
        sql<string | null>`min(community_name)`.as('community_name'),
        sql<number>`count(*)::int`.as('vote_count'),
        sql<Date>`min(created_at)`.as('first_vote_at'),
        sql<Date>`max(created_at)`.as('last_vote_at'),
      ])
      .groupBy(['level', sql`lower(city_name)`, sql`coalesce(lower(community_name), '')`])
      .orderBy('vote_count', 'desc')
      .limit(500)
      .execute();
    return rows.map((r) => ({
      level: r.level,
      cityName: r.city_name,
      communityName: r.community_name,
      voteCount: r.vote_count,
      firstVoteAt: iso(new Date(r.first_vote_at)),
      lastVoteAt: iso(new Date(r.last_vote_at)),
    }));
  }
}

// ------------------------------------------------------------------ mappers

type Stamp = { version: number; created_at: Date; updated_at: Date };

function toCity(r: { id: string; name: string; state: string; status: 'ACTIVE' | 'INACTIVE' } & Stamp): City {
  return {
    id: r.id,
    name: r.name,
    state: r.state,
    status: r.status,
    version: r.version,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function toCluster(
  r: {
    id: string;
    name: string;
    code: string;
    description: string | null;
    status: 'ACTIVE' | 'INACTIVE';
    community_count: number | null;
  } & Stamp,
): Cluster {
  return {
    id: r.id,
    name: r.name,
    code: r.code,
    description: r.description,
    status: r.status,
    communityCount: r.community_count ?? 0,
    version: r.version,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function toCommunity(
  r: {
    id: string;
    city_id: string;
    city_name: string;
    name: string;
    code: string;
    address_line: string | null;
    postal_code: string | null;
    location_lat: string | null;
    location_lng: string | null;
    status: Community['status'];
    cluster_id: string | null;
    cluster_name: string | null;
  } & Stamp,
): Community {
  return {
    id: r.id,
    cityId: r.city_id,
    cityName: r.city_name,
    name: r.name,
    code: r.code,
    addressLine: r.address_line,
    postalCode: r.postal_code,
    location: geo(r.location_lat, r.location_lng),
    status: r.status,
    clusterId: r.cluster_id,
    clusterName: r.cluster_name,
    version: r.version,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function toTower(
  r: {
    id: string;
    community_id: string;
    name: string;
    floor_count: number | null;
    location_lat: string | null;
    location_lng: string | null;
    status: 'ACTIVE' | 'INACTIVE';
    flat_count: number | null;
  } & Stamp,
): Tower {
  return {
    id: r.id,
    communityId: r.community_id,
    name: r.name,
    floorCount: r.floor_count,
    location: geo(r.location_lat, r.location_lng),
    status: r.status,
    flatCount: r.flat_count ?? 0,
    version: r.version,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function toFlat(
  r: {
    id: string;
    tower_id: string;
    tower_name: string;
    community_id: string;
    floor: number | null;
    flat_number: string;
    bhk_type: string | null;
    area_sqft: string | null;
    residence_category_id: string | null;
    residence_category_label: string | null;
    occupancy: 'OWNER' | 'TENANT' | 'VACANT' | null;
    status: 'ACTIVE' | 'INACTIVE';
  } & Stamp,
): Flat {
  return {
    id: r.id,
    towerId: r.tower_id,
    towerName: r.tower_name,
    communityId: r.community_id,
    floor: r.floor,
    flatNumber: r.flat_number,
    bhkType: r.bhk_type,
    areaSqft: num(r.area_sqft),
    residenceCategoryId: r.residence_category_id,
    residenceCategoryLabel: r.residence_category_label,
    occupancy: r.occupancy,
    status: r.status,
    version: r.version,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}
