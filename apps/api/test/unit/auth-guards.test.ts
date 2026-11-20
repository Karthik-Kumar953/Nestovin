import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { actor, fakeDeps } from '../helpers/fake-deps';

const SUPER = '11111111-1111-4111-8111-111111111111';
const VIEWER = '22222222-2222-4222-8222-222222222222';
const NOGRANTS = '33333333-3333-4333-8333-333333333333';
const DISABLED = '44444444-4444-4444-8444-444444444444';

const app = createApp(
  fakeDeps({
    [SUPER]: { status: 'ACTIVE', actor: actor({ id: SUPER, isSuperAdmin: true }) },
    [VIEWER]: {
      status: 'ACTIVE',
      actor: actor({ id: VIEWER, grants: ['locations:view'], scope: { type: 'CLUSTERS', clusterIds: [] } }),
    },
    [NOGRANTS]: { status: 'ACTIVE', actor: actor({ id: NOGRANTS }) },
    [DISABLED]: { status: 'DISABLED', actor: actor({ id: DISABLED, isSuperAdmin: true }) },
  }),
);

const auth = (aal: string, id: string) => ({ Authorization: `Bearer token:${aal}:${id}` });

describe('admin authentication', () => {
  it('rejects requests without a token (401)', async () => {
    const res = await request(app).get('/v1/admin/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('rejects an invalid token (401)', async () => {
    const res = await request(app).get('/v1/admin/me').set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(401);
  });

  it('requires completed MFA (aal2) for admins', async () => {
    const res = await request(app).get('/v1/admin/me').set(auth('aal1', SUPER));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MFA_REQUIRED');
  });

  it('treats a valid token without an admin profile as unauthenticated', async () => {
    const res = await request(app).get('/v1/admin/me').set(auth('aal2', '55555555-5555-4555-8555-555555555555'));
    expect(res.status).toBe(401);
  });

  it('denies a disabled admin even with a still-valid token', async () => {
    const res = await request(app).get('/v1/admin/me').set(auth('aal2', DISABLED));
    expect(res.status).toBe(401);
  });

  it('returns the effective grants for the current admin', async () => {
    const res = await request(app).get('/v1/admin/me').set(auth('aal2', VIEWER));
    expect(res.status).toBe(200);
    expect(res.body.grants).toEqual([{ module: 'locations', action: 'view' }]);
    expect(res.body.isSuperAdmin).toBe(false);
  });

  it('flags a signed-in admin with no grants', async () => {
    const res = await request(app).get('/v1/admin/me').set(auth('aal2', NOGRANTS));
    expect(res.body.hasAnyAccess).toBe(false);
  });
});

describe('module/action authorisation', () => {
  it('blocks a module the admin was not granted, even via direct API call', async () => {
    const res = await request(app).get('/v1/admin/cities').set(auth('aal2', NOGRANTS));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('blocks an action the admin was not granted (view-only cannot create)', async () => {
    const res = await request(app)
      .post('/v1/admin/cities')
      .set(auth('aal2', VIEWER))
      .send({ name: 'Hyderabad', state: 'Telangana' });
    expect(res.status).toBe(403);
  });

  it('keeps admin user/role management Super-Admin-only', async () => {
    for (const path of ['/v1/admin/admins', '/v1/admin/roles', '/v1/admin/permission-catalogue']) {
      const res = await request(app).get(path).set(auth('aal2', VIEWER));
      expect(res.status, path).toBe(403);
    }
  });

  it('validates input before touching the database (422 with field errors)', async () => {
    const res = await request(app).post('/v1/admin/roles').set(auth('aal2', SUPER)).send({ name: 'x', grants: [] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields[0].path).toBe('name');
  });

  it('rejects a role that tries to grant the Super-Admin-only module', async () => {
    const res = await request(app)
      .post('/v1/admin/roles')
      .set(auth('aal2', SUPER))
      .send({ name: 'Escalation', grants: [{ module: 'admin_access', action: 'create' }] });
    expect(res.status).toBe(422);
  });

  it('rejects malformed ids with 422 instead of reaching the database', async () => {
    const res = await request(app).get('/v1/admin/communities/not-a-uuid').set(auth('aal2', SUPER));
    expect(res.status).toBe(422);
  });
});

describe('HTTP hardening', () => {
  it('sets security headers and no-store caching', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('returns the standard envelope for unknown routes', async () => {
    const res = await request(app).get('/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects malformed JSON safely', async () => {
    const res = await request(app)
      .post('/v1/admin/roles')
      .set(auth('aal2', SUPER))
      .set('Content-Type', 'application/json')
      .send('{"name":');
    expect(res.status).toBe(422);
    expect(res.body.error.message).not.toMatch(/at JSON|position/i);
  });
});
