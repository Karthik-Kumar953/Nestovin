import type { Action, Me, ModuleKey } from '@nestovin/contracts';

/**
 * UX-only permission check used to show/hide navigation and buttons.
 * It is NOT a security control: the API enforces every permission and scope.
 */
export function can(me: Me | null | undefined, module: ModuleKey, action: Action = 'view'): boolean {
  if (!me) return false;
  if (me.isSuperAdmin) return true;
  return me.grants.some((g) => g.module === module && g.action === action);
}

export function isGlobalScope(me: Me | null | undefined): boolean {
  return me?.isSuperAdmin === true || me?.scope.type === 'GLOBAL';
}
