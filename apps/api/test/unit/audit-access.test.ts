import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { actor, fakeDeps } from '../helpers/fake-deps';

const SCOPED = '12121212-1212-4121-8121-121212121212';
const GLOBAL_NO_MODULE = '13131313-1313-4131-8131-131313131313';
const app = createApp(
  fakeDeps({
    [SCOPED]: { status: 'ACTIVE', actor: actor({ id: SCOPED, grants: ['employees:view'], scope: { type: 'CLUSTERS', clusterIds: [] } }) },
    [GLOBAL_NO_MODULE]: { status: 'ACTIVE', actor: actor({ id: GLOBAL_NO_MODULE, grants: ['support:view'] }) },
  }),
);
const auth = (id: string) => ({ Authorization: `Bearer token:aal2:${id}` });
const ID = '11111111-1111-4111-8111-111111111111';

describe('audit history access', () => {
  it('cluster-scoped admins cannot read history (audit rows carry no cluster)', async () => {
    expect((await request(app).get(`/v1/admin/audit/records/employee/${ID}`).set(auth(SCOPED))).status).toBe(403);
  });
  it('needs view on the record’s module', async () => {
    expect((await request(app).get(`/v1/admin/audit/records/employee/${ID}`).set(auth(GLOBAL_NO_MODULE))).status).toBe(403);
    expect((await request(app).get(`/v1/admin/audit/records/unknown_type/${ID}`).set(auth(GLOBAL_NO_MODULE))).status).toBe(403);
  });
  it('the full log is Super Admin only', async () => {
    expect((await request(app).get('/v1/admin/audit/events').set(auth(GLOBAL_NO_MODULE))).status).toBe(403);
  });
});
