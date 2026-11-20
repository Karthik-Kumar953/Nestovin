import { describe, expect, it } from 'vitest';
import { MODULES, MODULE_KEYS, allCatalogueGrants, isGrantable, isValidGrant } from './permissions';
import { createAdminUserSchema, createRoleSchema } from './admin-access';

describe('permission catalogue', () => {
  it('defines exactly the 14 V1 Admin modules', () => {
    expect(MODULE_KEYS).toHaveLength(14);
    const refs = MODULE_KEYS.map((k) => MODULES[k].ref).sort();
    expect(refs).toEqual(
      Array.from({ length: 14 }, (_, i) => `ADM-${String(i + 1).padStart(2, '0')}`),
    );
  });

  it('reserves admin access management for the Super Admin', () => {
    expect(isGrantable('admin_access')).toBe(false);
    expect(MODULE_KEYS.filter((k) => !isGrantable(k))).toEqual(['admin_access']);
  });

  it('validates module/action pairs against the catalogue', () => {
    expect(isValidGrant('locations', 'edit')).toBe(true);
    expect(isValidGrant('family_requests', 'delete')).toBe(false);
    expect(isValidGrant('not_a_module', 'view')).toBe(false);
    expect(allCatalogueGrants().length).toBeGreaterThan(14);
  });
});

describe('role and admin schemas', () => {
  it('rejects a role granting a Super-Admin-only module', () => {
    const result = createRoleSchema.safeParse({
      name: 'Sneaky',
      grants: [{ module: 'admin_access', action: 'create' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an action that the module does not support', () => {
    const result = createRoleSchema.safeParse({
      name: 'Family reviewers',
      grants: [{ module: 'family_requests', action: 'delete' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate grants', () => {
    const result = createRoleSchema.safeParse({
      name: 'Ops',
      grants: [
        { module: 'locations', action: 'view' },
        { module: 'locations', action: 'view' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('requires at least one cluster for a cluster-scoped admin', () => {
    const result = createAdminUserSchema.safeParse({
      email: 'ops@example.com',
      fullName: 'Ops Admin',
      scope: { type: 'CLUSTERS', clusterIds: [] },
    });
    expect(result.success).toBe(false);
  });
});
