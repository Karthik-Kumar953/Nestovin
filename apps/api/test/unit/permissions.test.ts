import { describe, expect, it } from 'vitest';
import { can, effectiveGrantList, inScope, scopeClusterIds, toDbClaims } from '../../src/auth/permissions';
import { likeContains } from '../../src/lib/pagination';
import { loadEnv } from '../../src/config/env';
import { actor, TEST_ENV } from '../helpers/fake-deps';

const C1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const C2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('can()', () => {
  it('allows only granted module/action pairs', () => {
    const a = actor({ grants: ['locations:view', 'locations:edit'] });
    expect(can(a, 'locations', 'view')).toBe(true);
    expect(can(a, 'locations', 'edit')).toBe(true);
    expect(can(a, 'locations', 'create')).toBe(false);
    expect(can(a, 'residents', 'view')).toBe(false);
  });

  it('never allows the Super-Admin-only module to a normal admin, even with a stray grant', () => {
    const a = actor({ grants: ['admin_access:view' as never] });
    expect(can(a, 'admin_access', 'view')).toBe(false);
  });

  it('lets the Super Admin do every catalogue action but nothing outside the catalogue', () => {
    const root = actor({ isSuperAdmin: true });
    expect(can(root, 'admin_access', 'create')).toBe(true);
    expect(can(root, 'finance_payroll', 'record_payment')).toBe(true);
    expect(can(root, 'family_requests', 'delete')).toBe(false);
  });

  it('lists the full catalogue as effective grants for the Super Admin', () => {
    expect(effectiveGrantList(actor({ isSuperAdmin: true })).length).toBeGreaterThan(40);
  });
});

describe('cluster scope', () => {
  it('global scope sees everything, including unassigned records', () => {
    const a = actor({ scope: { type: 'GLOBAL' } });
    expect(inScope(a, C1)).toBe(true);
    expect(inScope(a, null)).toBe(true);
    expect(scopeClusterIds(a)).toBe('all');
  });

  it('cluster scope sees only its clusters and never unassigned records', () => {
    const a = actor({ scope: { type: 'CLUSTERS', clusterIds: [C1] } });
    expect(inScope(a, C1)).toBe(true);
    expect(inScope(a, C2)).toBe(false);
    expect(inScope(a, null)).toBe(false);
  });

  it('maps scope into transaction claims', () => {
    expect(toDbClaims(actor({ scope: { type: 'CLUSTERS', clusterIds: [C1, C2] } })).clusterIds).toEqual([C1, C2]);
    expect(toDbClaims(actor()).clusterIds).toBe('all');
  });
});

describe('likeContains()', () => {
  it('escapes user-supplied wildcards', () => {
    expect(likeContains('50%_off')).toBe('%50\\%\\_off%');
    expect(likeContains('a\\b')).toBe('%a\\\\b%');
  });
});

describe('environment safety', () => {
  it('refuses to start in production with MFA disabled', () => {
    expect(() =>
      loadEnv({ ...TEST_ENV, NODE_ENV: 'production', ADMIN_REQUIRE_MFA: 'false', CORS_ORIGINS: 'https://admin.example.com' }),
    ).toThrow(/MFA cannot be disabled/);
  });

  it('refuses plain-http CORS origins in production', () => {
    expect(() => loadEnv({ ...TEST_ENV, NODE_ENV: 'production', CORS_ORIGINS: 'http://admin.example.com' })).toThrow(
      /https/,
    );
  });

  it('treats empty optional variables as not set', () => {
    const env = loadEnv({ ...TEST_ENV, SUPABASE_JWT_SECRET: '', SUPPORT_ENQUIRY_EMAIL: '  ', DATABASE_SSL_CA_PATH: '' });
    expect(env.SUPABASE_JWT_SECRET).toBeUndefined();
    expect(env.SUPPORT_ENQUIRY_EMAIL).toBeUndefined();
    expect(env.DATABASE_SSL_CA_PATH).toBeUndefined();
  });

  it('reports every missing required variable', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL[\s\S]*SUPABASE_URL/);
  });
});
