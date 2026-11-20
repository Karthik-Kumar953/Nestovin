import { sql } from 'kysely';
import type {
  AdminUser,
  AdminUserDetail,
  CreateAdminUserInput,
  CreateRoleInput,
  DataScope,
  EffectiveGrant,
  Role,
  SetAdminStatusInput,
  UpdateAdminUserInput,
  UpdateRoleInput,
} from '@nestovin/contracts';
import type { Database, Tx } from '../../db/database';
import { withTx } from '../../db/database';
import { toDbClaims, type AdminActor } from '../../auth/permissions';
import type { AuthAdminAdapter } from '../../integrations/auth-admin';
import type { Logger } from '../../lib/logger';
import { businessRule, conflict, forbidden, fromPgError, notFound, versionConflict } from '../../lib/errors';
import { decodeCursor, likeContains, toPage } from '../../lib/pagination';
import { auditAdmin } from '../audit/audit';

/*
 * IAM-style admin access (ADR-008). Every method here is reachable only by the
 * Super Admin: the `admin_access` module is not grantable, so authorize() lets
 * nobody else through. Guards that hold even for the Super Admin:
 *  - nobody changes their own roles, grants, scope or status
 *  - the last active Super Admin cannot be disabled (DB trigger)
 *  - Super Admin status cannot be granted through the API (OPEN decision OPN-17)
 */

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

const UNIQUE_FIELDS = {
  roles_name_uq: { path: 'name', message: 'A role with this name already exists' },
  admin_profiles_email_key: { path: 'email', message: 'An admin with this email already exists' },
};

function mapPg(err: unknown): never {
  throw fromPgError(err, UNIQUE_FIELDS) ?? err;
}

type GrantRow = { module_key: string; action_key: string };

export class AdminAccessService {
  constructor(
    private readonly db: Database,
    private readonly authAdmin: AuthAdminAdapter,
    private readonly logger: Logger,
    private readonly inviteRedirectUrl: string,
  ) {}

  private tx<T>(actor: AdminActor, fn: (trx: Tx) => Promise<T>) {
    return withTx(this.db, toDbClaims(actor), fn);
  }

  // ------------------------------------------------------------------ roles

  private async loadRoles(trx: Database | Tx, ids?: string[]): Promise<Role[]> {
    let q = trx
      .selectFrom('app.roles as r')
      .selectAll('r')
      .select((eb) =>
        eb
          .selectFrom('app.admin_role_assignments as a')
          .whereRef('a.role_id', '=', 'r.id')
          .select(sql<number>`count(*)::int`.as('n'))
          .as('member_count'),
      );
    if (ids) {
      if (ids.length === 0) return [];
      q = q.where('r.id', 'in', ids);
    }
    const roles = await q.orderBy(sql`lower(r.name)`).execute();
    if (roles.length === 0) return [];
    const grants = await trx
      .selectFrom('app.role_grants')
      .select(['role_id', 'module_key', 'action_key'])
      .where(
        'role_id',
        'in',
        roles.map((r) => r.id),
      )
      .orderBy('module_key')
      .orderBy('action_key')
      .execute();
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      grants: grants.filter((g) => g.role_id === r.id).map((g) => ({ module: g.module_key, action: g.action_key })),
      memberCount: r.member_count ?? 0,
      version: r.version,
      createdAt: iso(r.created_at)!,
      updatedAt: iso(r.updated_at)!,
    }));
  }

  listRoles(): Promise<Role[]> {
    return this.loadRoles(this.db);
  }

  async getRole(id: string): Promise<Role> {
    const [role] = await this.loadRoles(this.db, [id]);
    if (!role) throw notFound('Role');
    return role;
  }

  async createRole(actor: AdminActor, requestId: string, input: CreateRoleInput): Promise<Role> {
    return this.tx(actor, async (trx) => {
      const inserted = await trx
        .insertInto('app.roles')
        .values({ name: input.name, description: input.description ?? null })
        .returning('id')
        .executeTakeFirstOrThrow()
        .catch(mapPg);
      if (input.grants.length) {
        await trx
          .insertInto('app.role_grants')
          .values(input.grants.map((g) => ({ role_id: inserted.id, module_key: g.module, action_key: g.action })))
          .execute();
      }
      const [role] = await this.loadRoles(trx, [inserted.id]);
      await auditAdmin(trx, actor, requestId, { action: 'role.created', targetType: 'role', targetId: inserted.id, after: role });
      return role!;
    });
  }

  async updateRole(actor: AdminActor, requestId: string, id: string, input: UpdateRoleInput): Promise<Role> {
    return this.tx(actor, async (trx) => {
      const [before] = await this.loadRoles(trx, [id]);
      if (!before) throw notFound('Role');

      const updated = await trx
        .updateTable('app.roles')
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
        })
        .where('id', '=', id)
        .where('version', '=', input.version)
        .returning('id')
        .executeTakeFirst()
        .catch(mapPg);
      if (!updated) throw versionConflict();

      if (input.grants) {
        await trx.deleteFrom('app.role_grants').where('role_id', '=', id).execute();
        if (input.grants.length) {
          await trx
            .insertInto('app.role_grants')
            .values(input.grants.map((g) => ({ role_id: id, module_key: g.module, action_key: g.action })))
            .execute();
        }
      }

      const [role] = await this.loadRoles(trx, [id]);
      // Grant changes apply to every holder of the role on their next request.
      await auditAdmin(trx, actor, requestId, { action: 'role.updated', targetType: 'role', targetId: id, before, after: role });
      return role!;
    });
  }

  async deleteRole(actor: AdminActor, requestId: string, id: string): Promise<void> {
    await this.tx(actor, async (trx) => {
      const [before] = await this.loadRoles(trx, [id]);
      if (!before) throw notFound('Role');
      if (before.memberCount > 0) {
        throw businessRule(`Remove this role from ${before.memberCount} admin(s) before deleting it`);
      }
      await trx.deleteFrom('app.roles').where('id', '=', id).execute();
      await auditAdmin(trx, actor, requestId, { action: 'role.deleted', targetType: 'role', targetId: id, before });
    });
  }

  // ------------------------------------------------------------ admin users

  private async loadAdmins(trx: Database | Tx, ids: string[]): Promise<AdminUser[]> {
    if (ids.length === 0) return [];
    const [profiles, roles, extras, clusters] = await Promise.all([
      trx.selectFrom('app.admin_profiles').selectAll().where('id', 'in', ids).execute(),
      trx
        .selectFrom('app.admin_role_assignments as a')
        .innerJoin('app.roles as r', 'r.id', 'a.role_id')
        .select(['a.admin_id', 'r.id', 'r.name'])
        .where('a.admin_id', 'in', ids)
        .orderBy('r.name')
        .execute(),
      trx
        .selectFrom('app.admin_extra_grants')
        .select(['admin_id', 'module_key', 'action_key'])
        .where('admin_id', 'in', ids)
        .execute(),
      trx
        .selectFrom('app.admin_cluster_scopes')
        .select(['admin_id', 'cluster_id'])
        .where('admin_id', 'in', ids)
        .execute(),
    ]);
    const byId = new Map(profiles.map((p) => [p.id, p]));
    return ids
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => ({
        id: p.id,
        email: p.email,
        fullName: p.full_name,
        title: p.title,
        isSuperAdmin: p.is_super_admin,
        status: p.status,
        roles: roles.filter((r) => r.admin_id === p.id).map((r) => ({ id: r.id, name: r.name })),
        extraGrants: extras
          .filter((e) => e.admin_id === p.id)
          .map((e) => ({ module: e.module_key, action: e.action_key })),
        scope:
          p.scope_type === 'GLOBAL'
            ? ({ type: 'GLOBAL' } as const)
            : ({
                type: 'CLUSTERS',
                clusterIds: clusters.filter((c) => c.admin_id === p.id).map((c) => c.cluster_id),
              } as DataScope),
        version: p.version,
        lastSignInAt: iso(p.last_sign_in_at ?? null),
        createdAt: iso(p.created_at)!,
        updatedAt: iso(p.updated_at)!,
      }));
  }

  async listAdmins(p: { limit: number; cursor?: string | undefined; q?: string | undefined; status?: string | undefined }) {
    const cursor = decodeCursor(p.cursor);
    const search = p.q;
    let q = this.db.selectFrom('app.admin_profiles').select(['id', 'full_name']);
    if (search) {
      q = q.where((eb) => eb.or([eb('full_name', 'ilike', likeContains(search)), eb('email', 'ilike', likeContains(search))]));
    }
    if (p.status) q = q.where('status', '=', p.status as AdminUser['status']);
    if (cursor) {
      q = q.where((eb) =>
        eb.or([
          eb(sql`lower(full_name)`, '>', cursor.v),
          eb.and([eb(sql`lower(full_name)`, '=', cursor.v), eb('id', '>', cursor.id)]),
        ]),
      );
    }
    const rows = await q.orderBy(sql`lower(full_name)`).orderBy('id').limit(p.limit + 1).execute();
    const page = toPage(rows, p.limit, (r) => ({ v: r.full_name.toLowerCase(), id: r.id }));
    return { items: await this.loadAdmins(this.db, page.items.map((r) => r.id)), nextCursor: page.nextCursor };
  }

  async getAdmin(id: string): Promise<AdminUserDetail> {
    const [admin] = await this.loadAdmins(this.db, [id]);
    if (!admin) throw notFound('Admin');
    const rows = await this.db
      .selectFrom('app.admin_effective_grants')
      .select(['module_key', 'action_key', 'source'])
      .where('admin_id', '=', id)
      .execute();
    const merged = new Map<string, EffectiveGrant>();
    for (const r of rows) {
      const key = `${r.module_key}:${r.action_key}`;
      const existing = merged.get(key);
      if (existing) existing.sources.push(r.source);
      else merged.set(key, { module: r.module_key, action: r.action_key, sources: [r.source] });
    }
    return { ...admin, effectiveGrants: [...merged.values()].sort((a, b) => `${a.module}:${a.action}`.localeCompare(`${b.module}:${b.action}`)) };
  }

  private async assertRolesExist(trx: Tx, roleIds: string[]) {
    if (roleIds.length === 0) return;
    const found = await trx.selectFrom('app.roles').select('id').where('id', 'in', roleIds).execute();
    if (found.length !== new Set(roleIds).size) throw businessRule('One or more selected roles no longer exist');
  }

  private async assertClustersActive(trx: Tx, scope: DataScope) {
    if (scope.type !== 'CLUSTERS') return;
    const found = await trx
      .selectFrom('app.clusters')
      .select('id')
      .where('id', 'in', scope.clusterIds)
      .where('status', '=', 'ACTIVE')
      .execute();
    if (found.length !== new Set(scope.clusterIds).size) {
      throw businessRule('One or more selected clusters do not exist or are inactive');
    }
  }

  private async replaceAccess(
    trx: Tx,
    actor: AdminActor,
    adminId: string,
    input: { roleIds?: string[] | undefined; extraGrants?: GrantInputLike[] | undefined; scope?: DataScope | undefined },
  ) {
    if (input.roleIds) {
      await this.assertRolesExist(trx, input.roleIds);
      await trx.deleteFrom('app.admin_role_assignments').where('admin_id', '=', adminId).execute();
      const unique = [...new Set(input.roleIds)];
      if (unique.length) {
        await trx
          .insertInto('app.admin_role_assignments')
          .values(unique.map((role_id) => ({ admin_id: adminId, role_id, assigned_by: actor.id })))
          .execute();
      }
    }
    if (input.extraGrants) {
      await trx.deleteFrom('app.admin_extra_grants').where('admin_id', '=', adminId).execute();
      if (input.extraGrants.length) {
        await trx
          .insertInto('app.admin_extra_grants')
          .values(
            input.extraGrants.map((g) => ({
              admin_id: adminId,
              module_key: g.module,
              action_key: g.action,
              granted_by: actor.id,
            })),
          )
          .execute();
      }
    }
    if (input.scope) {
      await this.assertClustersActive(trx, input.scope);
      await trx.updateTable('app.admin_profiles').set({ scope_type: input.scope.type }).where('id', '=', adminId).execute();
      await trx.deleteFrom('app.admin_cluster_scopes').where('admin_id', '=', adminId).execute();
      if (input.scope.type === 'CLUSTERS') {
        await trx
          .insertInto('app.admin_cluster_scopes')
          .values([...new Set(input.scope.clusterIds)].map((cluster_id) => ({ admin_id: adminId, cluster_id, granted_by: actor.id })))
          .execute();
      }
    }
  }

  async createAdmin(actor: AdminActor, requestId: string, input: CreateAdminUserInput): Promise<AdminUserDetail> {
    // Validate everything that can fail BEFORE creating the auth user and sending an invite.
    await this.tx(actor, async (trx) => {
      const existing = await trx.selectFrom('app.admin_profiles').select('id').where('email', '=', input.email).executeTakeFirst();
      if (existing) throw conflict('An admin with this email already exists', [{ path: 'email', message: 'Already an admin' }]);
      await this.assertRolesExist(trx, input.roleIds);
      await this.assertClustersActive(trx, input.scope);
    });

    let userId: string;
    try {
      ({ userId } = await this.authAdmin.inviteUser(input.email, this.inviteRedirectUrl));
    } catch (err) {
      this.logger.warn({ err, requestId }, 'admin invite failed');
      throw businessRule('The invitation could not be sent. Check the email address or try again later.');
    }

    try {
      await this.tx(actor, async (trx) => {
        await trx
          .insertInto('app.admin_profiles')
          .values({
            id: userId,
            email: input.email,
            full_name: input.fullName,
            title: input.title ?? null,
            status: 'INVITED',
            scope_type: input.scope.type,
          })
          .execute()
          .catch(mapPg);
        await this.replaceAccess(trx, actor, userId, input);
        const [created] = await this.loadAdmins(trx, [userId]);
        await auditAdmin(trx, actor, requestId, { action: 'admin.invited', targetType: 'admin', targetId: userId, after: created });
      });
    } catch (err) {
      // Compensate: do not leave an orphaned auth user that has no admin profile.
      await this.authAdmin.deleteUser(userId).catch((e) => this.logger.error({ err: e, userId }, 'cleanup of invited user failed'));
      throw err;
    }
    return this.getAdmin(userId);
  }

  async updateAdmin(actor: AdminActor, requestId: string, id: string, input: UpdateAdminUserInput): Promise<AdminUserDetail> {
    const changesAccess = input.roleIds !== undefined || input.extraGrants !== undefined || input.scope !== undefined;
    if (id === actor.id && changesAccess) throw forbidden('You cannot change your own access');

    await this.tx(actor, async (trx) => {
      const [before] = await this.loadAdmins(trx, [id]);
      if (!before) throw notFound('Admin');
      if (before.isSuperAdmin && changesAccess) {
        throw businessRule('Super Admin access is not managed through roles or scope');
      }
      const updated = await trx
        .updateTable('app.admin_profiles')
        .set({
          ...(input.fullName !== undefined ? { full_name: input.fullName } : {}),
          ...(input.title !== undefined ? { title: input.title } : {}),
        })
        .where('id', '=', id)
        .where('version', '=', input.version)
        .returning('id')
        .executeTakeFirst();
      if (!updated) throw versionConflict();
      await this.replaceAccess(trx, actor, id, input);
      const [after] = await this.loadAdmins(trx, [id]);
      await auditAdmin(trx, actor, requestId, { action: 'admin.updated', targetType: 'admin', targetId: id, before, after });
    });
    return this.getAdmin(id);
  }

  async setStatus(actor: AdminActor, requestId: string, id: string, input: SetAdminStatusInput): Promise<AdminUserDetail> {
    if (id === actor.id) throw forbidden('You cannot change the status of your own account');

    await this.tx(actor, async (trx) => {
      const before = await trx.selectFrom('app.admin_profiles').select(['status', 'version']).where('id', '=', id).executeTakeFirst();
      if (!before) throw notFound('Admin');
      if (input.status === 'ACTIVE' && before.status === 'INVITED') {
        throw businessRule('This admin becomes active when they accept the invitation and sign in');
      }
      const updated = await trx
        .updateTable('app.admin_profiles')
        .set({ status: input.status })
        .where('id', '=', id)
        .where('version', '=', input.version)
        .returning('id')
        .executeTakeFirst()
        .catch(mapPg); // last-Super-Admin trigger -> readable business error
      if (!updated) throw versionConflict();
      await auditAdmin(trx, actor, requestId, {
        action: input.status === 'DISABLED' ? 'admin.disabled' : 'admin.enabled',
        targetType: 'admin',
        targetId: id,
        reason: input.reason,
        before: { status: before.status },
        after: { status: input.status },
      });
    });

    // Access is already denied per request by the profile status. Additionally
    // block token refresh at the identity provider (best effort, logged on failure).
    await this.authAdmin
      .setBanned(id, input.status === 'DISABLED')
      .catch((err) => this.logger.error({ err, adminId: id, requestId }, 'could not update identity-provider ban'));

    return this.getAdmin(id);
  }
}

type GrantInputLike = { module: string; action: string };
export type { GrantRow };
