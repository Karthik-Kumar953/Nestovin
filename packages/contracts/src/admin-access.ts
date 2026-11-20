import { z } from 'zod';
import { ACTIONS, MODULE_KEYS, isGrantable, isValidGrant, type ModuleKey } from './permissions';
import { uuidSchema, versionSchema } from './common';

/*
 * IAM-style admin access (ADR-008):
 * - Super Admin is the root account.
 * - Roles are reusable bundles of module/action grants.
 * - Admins get one or more roles plus optional per-user extra grants.
 * - Cluster data scope is always set per admin, never per role.
 */

export const grantSchema = z
  .object({
    module: z.enum(MODULE_KEYS as [ModuleKey, ...ModuleKey[]]),
    action: z.enum(ACTIONS),
  })
  .refine((g) => isValidGrant(g.module, g.action), {
    message: 'This action is not available for this module',
  })
  .refine((g) => isGrantable(g.module), {
    message: 'This module is reserved for the Super Admin and cannot be granted',
  });
export type GrantInput = z.infer<typeof grantSchema>;

const grantListSchema = z
  .array(grantSchema)
  .max(200)
  .refine((list) => new Set(list.map((g) => `${g.module}:${g.action}`)).size === list.length, {
    message: 'Duplicate permissions',
  });

// ---- Roles -----------------------------------------------------------------

export const roleSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  description: z.string().nullable(),
  grants: z.array(z.object({ module: z.string(), action: z.string() })),
  memberCount: z.number().int(),
  version: versionSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Role = z.infer<typeof roleSchema>;

export const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional(),
  grants: grantListSchema,
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = createRoleSchema.partial().extend({ version: versionSchema });
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

// ---- Data scope ------------------------------------------------------------

export const dataScopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('GLOBAL') }),
  z.object({ type: z.literal('CLUSTERS'), clusterIds: z.array(uuidSchema).min(1).max(100) }),
]);
export type DataScope = z.infer<typeof dataScopeSchema>;

// ---- Admin users -----------------------------------------------------------

export const adminStatusSchema = z.enum(['INVITED', 'ACTIVE', 'DISABLED']);
export type AdminStatus = z.infer<typeof adminStatusSchema>;

export const effectiveGrantSchema = z.object({
  module: z.string(),
  action: z.string(),
  /** Where the permission comes from: role names and/or 'extra'. */
  sources: z.array(z.string()),
});
export type EffectiveGrant = z.infer<typeof effectiveGrantSchema>;

export const adminUserSchema = z.object({
  id: uuidSchema,
  email: z.email(),
  fullName: z.string(),
  /** Organisational title shown in the UI (e.g. "Operations Lead"). Grants nothing. */
  title: z.string().nullable(),
  isSuperAdmin: z.boolean(),
  status: adminStatusSchema,
  roles: z.array(z.object({ id: uuidSchema, name: z.string() })),
  extraGrants: z.array(z.object({ module: z.string(), action: z.string() })),
  scope: dataScopeSchema,
  version: versionSchema,
  lastSignInAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminUserDetailSchema = adminUserSchema.extend({
  effectiveGrants: z.array(effectiveGrantSchema),
});
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;

export const createAdminUserSchema = z.object({
  email: z.email().trim().toLowerCase(),
  fullName: z.string().trim().min(2).max(120),
  title: z.string().trim().max(80).optional(),
  roleIds: z.array(uuidSchema).max(20).default([]),
  extraGrants: grantListSchema.default([]),
  scope: dataScopeSchema,
});
export type CreateAdminUserInput = z.infer<typeof createAdminUserSchema>;

export const updateAdminUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  title: z.string().trim().max(80).nullable().optional(),
  roleIds: z.array(uuidSchema).max(20).optional(),
  extraGrants: grantListSchema.optional(),
  scope: dataScopeSchema.optional(),
  version: versionSchema,
});
export type UpdateAdminUserInput = z.infer<typeof updateAdminUserSchema>;

export const setAdminStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'DISABLED']),
  reason: z.string().trim().min(3).max(500),
  version: versionSchema,
});
export type SetAdminStatusInput = z.infer<typeof setAdminStatusSchema>;

// ---- Current session -------------------------------------------------------

export const meSchema = z.object({
  id: uuidSchema,
  email: z.email(),
  fullName: z.string(),
  isSuperAdmin: z.boolean(),
  /** false = signed in but no module granted yet (show a restricted landing state). */
  hasAnyAccess: z.boolean(),
  grants: z.array(z.object({ module: z.string(), action: z.string() })),
  scope: dataScopeSchema,
});
export type Me = z.infer<typeof meSchema>;
