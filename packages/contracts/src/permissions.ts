/**
 * Admin permission catalogue (ADR-008, IAM-style access).
 *
 * The 14 V1 Admin modules and the actions each one supports. This list is the
 * single source of truth: the database seed migration must match it exactly
 * (enforced by a test in apps/api).
 *
 * Effective permissions for an admin = union of the grants of every assigned
 * role + the admin's per-user extra grants. Allow-only; there are no deny rules.
 * Data scope (clusters) is separate and always set per admin.
 */

export const ACTIONS = [
  'view',
  'create',
  'edit',
  'delete',
  'approve',
  'export',
  'publish',
  'record_payment',
] as const;
export type Action = (typeof ACTIONS)[number];

interface ModuleDefinition {
  /** PRD / Final workflow reference. */
  ref: string;
  label: string;
  actions: readonly Action[];
  /**
   * false = only the Super Admin can use this module; it cannot be granted to a
   * role or as an extra grant. Admin user/role management is Super Admin only
   * (Final workflow ADM-02).
   */
  grantable: boolean;
}

export const MODULES = {
  overview: { ref: 'ADM-01', label: 'Admin home & overview', actions: ['view'], grantable: true },
  admin_access: {
    ref: 'ADM-02',
    label: 'Admin users, roles & permissions',
    actions: ['view', 'create', 'edit', 'delete'],
    grantable: false,
  },
  locations: {
    ref: 'ADM-03',
    label: 'City, community, cluster, tower & flat master data',
    actions: ['view', 'create', 'edit', 'delete', 'export'],
    grantable: true,
  },
  community_migration: {
    ref: 'ADM-04',
    label: 'Community migration (Excel)',
    actions: ['view', 'create', 'approve', 'publish'],
    grantable: true,
  },
  residents: {
    ref: 'ADM-05',
    label: 'Resident management',
    actions: ['view', 'edit', 'approve', 'export'],
    grantable: true,
  },
  family_requests: {
    ref: 'ADM-06',
    label: 'Family-member approval requests',
    actions: ['view', 'approve'],
    grantable: true,
  },
  catalogue_pricing: {
    ref: 'ADM-07',
    label: 'Service, task, plan & pricing configuration',
    actions: ['view', 'create', 'edit', 'delete', 'publish'],
    grantable: true,
  },
  demand_payments: {
    ref: 'ADM-08',
    label: 'Demand, booking & payment status',
    actions: ['view', 'create', 'edit', 'approve', 'publish', 'export'],
    grantable: true,
  },
  employees: {
    ref: 'ADM-09',
    label: 'Employee profile & verification',
    actions: ['view', 'create', 'edit', 'approve', 'export'],
    grantable: true,
  },
  scheduling: {
    ref: 'ADM-10',
    label: 'Scheduling & time-slot configuration',
    actions: ['view', 'create', 'edit', 'delete', 'publish'],
    grantable: true,
  },
  allocation: {
    ref: 'ADM-11',
    label: 'Work allocation & replacement',
    actions: ['view', 'create', 'edit', 'approve'],
    grantable: true,
  },
  attendance: {
    ref: 'ADM-12',
    label: 'Attendance & service records',
    actions: ['view', 'approve', 'export'],
    grantable: true,
  },
  support: {
    ref: 'ADM-13',
    label: 'Support tickets & website enquiries',
    actions: ['view', 'create', 'edit', 'approve', 'export'],
    grantable: true,
  },
  finance_payroll: {
    ref: 'ADM-14',
    label: 'Finance & basic payroll',
    actions: ['view', 'create', 'edit', 'approve', 'record_payment', 'export'],
    grantable: true,
  },
} as const satisfies Record<string, ModuleDefinition>;

export type ModuleKey = keyof typeof MODULES;
export const MODULE_KEYS = Object.keys(MODULES) as ModuleKey[];

/** A single permission, e.g. `{ module: 'locations', action: 'edit' }`. */
export interface Grant {
  module: ModuleKey;
  action: Action;
}

export function isValidGrant(module: string, action: string): module is ModuleKey {
  const def = (MODULES as Record<string, ModuleDefinition>)[module];
  return def !== undefined && (def.actions as readonly string[]).includes(action);
}

export function isGrantable(module: ModuleKey): boolean {
  return MODULES[module].grantable;
}

export type GrantKey = `${ModuleKey}:${Action}`;

/** Stable string form used in sets and API payloads: `module:action`. */
export function grantKey(module: ModuleKey, action: Action): GrantKey {
  return `${module}:${action}`;
}

/** Every valid (module, action) pair in the catalogue. */
export function allCatalogueGrants(): Grant[] {
  return MODULE_KEYS.flatMap((module) =>
    MODULES[module].actions.map((action) => ({ module, action }) as Grant),
  );
}
