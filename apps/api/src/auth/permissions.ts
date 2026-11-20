import {
  MODULES,
  allCatalogueGrants,
  grantKey,
  isGrantable,
  type Action,
  type DataScope,
  type GrantKey,
  type ModuleKey,
} from '@nestovin/contracts';
import type { DbClaims } from '../db/database';

/** The authenticated admin for the current request, resolved fresh from the DB on every request. */
export interface AdminActor {
  id: string;
  email: string;
  fullName: string;
  isSuperAdmin: boolean;
  /** Effective grants: union of role grants and extra grants (allow-only). Empty for Super Admin (root bypass). */
  grants: ReadonlySet<GrantKey>;
  scope: DataScope;
}

/**
 * Module/action check (layer 1).
 * - Super Admin (root) may do everything in the catalogue.
 * - Super-Admin-only modules (admin_access) are never available to others,
 *   even if a grant row somehow existed.
 * - Otherwise: allowed only if the effective grants contain module:action.
 */
export function can(actor: AdminActor, module: ModuleKey, action: Action): boolean {
  const def = MODULES[module];
  if (!(def.actions as readonly Action[]).includes(action)) return false;
  if (actor.isSuperAdmin) return true;
  if (!isGrantable(module)) return false;
  return actor.grants.has(grantKey(module, action));
}

/** True if the actor may see/act on any module at all (used for the portal landing state). */
export function hasAnyAccess(actor: AdminActor): boolean {
  return actor.isSuperAdmin || actor.grants.size > 0;
}

/** Cluster data-scope check (layer 2). A record with no cluster is visible to global scope only. */
export function inScope(actor: AdminActor, clusterId: string | null | undefined): boolean {
  if (actor.scope.type === 'GLOBAL') return true;
  if (!clusterId) return false;
  return actor.scope.clusterIds.includes(clusterId);
}

export function hasGlobalScope(actor: AdminActor): boolean {
  return actor.scope.type === 'GLOBAL';
}

/** The cluster ids to filter by, or 'all' for global scope. */
export function scopeClusterIds(actor: AdminActor): 'all' | readonly string[] {
  return actor.scope.type === 'GLOBAL' ? 'all' : actor.scope.clusterIds;
}

export function toDbClaims(actor: AdminActor): DbClaims {
  return {
    userId: actor.id,
    actorKind: 'admin',
    isSuperAdmin: actor.isSuperAdmin,
    clusterIds: scopeClusterIds(actor),
  };
}

/** Grants as returned to clients (for building navigation). Super Admin gets the full catalogue. */
export function effectiveGrantList(actor: AdminActor): { module: string; action: string }[] {
  if (actor.isSuperAdmin) return allCatalogueGrants();
  return [...actor.grants].map((k) => {
    const [module, action] = k.split(':') as [string, string];
    return { module, action };
  });
}
