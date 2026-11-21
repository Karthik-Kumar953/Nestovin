import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { actor, fakeDeps } from '../helpers/fake-deps';

/* BUG-QA-001 / BUG-QA-002: Super-Admin-only routes answer 403 before any validation. */
const NO_GRANTS = '21212121-2121-4212-8212-212121212121';
const LOCATIONS_VIEW = '23232323-2323-4232-8232-232323232323';
const app = createApp(
  fakeDeps({
    [NO_GRANTS]: { status: 'ACTIVE', actor: actor({ id: NO_GRANTS, grants: [] }) },
    [LOCATIONS_VIEW]: { status: 'ACTIVE', actor: actor({ id: LOCATIONS_VIEW, grants: ['locations:view'] }) },
  }),
);
const auth = (id: string) => ({ Authorization: `Bearer token:aal2:${id}` });

describe('Super-Admin-only routes', () => {
  it('holiday changes return 403 (not a validation error) for other admins', async () => {
    const res = await request(app).post('/v1/admin/holidays').set(auth(NO_GRANTS)).send({ bogus: true });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toMatch(/details|path/);
    expect((await request(app).delete('/v1/admin/holidays/2026-12-25').set(auth(NO_GRANTS))).status).toBe(403);
  });
  it('expansion votes need the Super Admin, not just locations:view', async () => {
    expect((await request(app).get('/v1/admin/expansion-votes').set(auth(LOCATIONS_VIEW))).status).toBe(403);
  });
});
