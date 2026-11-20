import { grantKey, type Action, type GrantKey, type ModuleKey } from '@nestovin/contracts';
import type { Database } from '../db/database';
import type { AdminActor } from './permissions';

export type AdminProfileStatus = 'INVITED' | 'ACTIVE' | 'DISABLED';

export interface LoadedAdmin {
  actor: AdminActor;
  status: AdminProfileStatus;
}

export interface AdminActorLoader {
  load(userId: string): Promise<LoadedAdmin | null>;
}

/**
 * Loads the admin's profile, effective grants and cluster scope from the
 * database on every request (no cache: ADR-008). Disabling an admin or removing
 * a grant therefore takes effect on their very next request.
 */
export function createAdminActorLoader(db: Database): AdminActorLoader {
  return {
    async load(userId) {
      const profile = await db
        .selectFrom('app.admin_profiles')
        .select(['id', 'email', 'full_name', 'is_super_admin', 'status', 'scope_type'])
        .where('id', '=', userId)
        .executeTakeFirst();
      if (!profile) return null;

      const [grants, clusters] = await Promise.all([
        db
          .selectFrom('app.admin_effective_grants')
          .select(['module_key', 'action_key'])
          .where('admin_id', '=', userId)
          .execute(),
        profile.scope_type === 'CLUSTERS'
          ? db
              .selectFrom('app.admin_cluster_scopes')
              .select('cluster_id')
              .where('admin_id', '=', userId)
              .execute()
          : Promise.resolve([]),
      ]);

      const grantSet = new Set<GrantKey>(
        grants.map((g) => grantKey(g.module_key as ModuleKey, g.action_key as Action)),
      );

      return {
        status: profile.status,
        actor: {
          id: profile.id,
          email: profile.email,
          fullName: profile.full_name,
          isSuperAdmin: profile.is_super_admin,
          grants: grantSet,
          scope:
            profile.scope_type === 'GLOBAL'
              ? { type: 'GLOBAL' }
              : { type: 'CLUSTERS', clusterIds: clusters.map((c) => c.cluster_id) },
        },
      };
    },
  };
}
