import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { canMoveTicket } from '../../src/modules/support/service';
import { actor, fakeDeps } from '../helpers/fake-deps';

const NOGRANTS = '33333333-3333-4333-8333-333333333333';
const SUPPORT_VIEW = '66666666-6666-4666-8666-666666666666';

const app = createApp(
  fakeDeps({
    [NOGRANTS]: { status: 'ACTIVE', actor: actor({ id: NOGRANTS }) },
    [SUPPORT_VIEW]: { status: 'ACTIVE', actor: actor({ id: SUPPORT_VIEW, grants: ['support:view'] }) },
  }),
);
const auth = (id: string) => ({ Authorization: `Bearer token:aal2:${id}` });

describe('resident authentication', () => {
  it('rejects resident requests without a token', async () => {
    const res = await request(app).get('/v1/resident/me');
    expect(res.status).toBe(401);
  });

  it('rejects a token that did not come from phone OTP (e.g. an admin email session)', async () => {
    const res = await request(app).get('/v1/resident/me').set(auth(NOGRANTS));
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/phone number/);
  });
});

describe('admin resident & support permissions', () => {
  it.each([
    ['get', '/v1/admin/residents'],
    ['get', '/v1/admin/residence-verifications'],
    ['post', '/v1/admin/residence-verifications/11111111-1111-4111-8111-111111111111/approve'],
    ['get', '/v1/admin/family-requests'],
    ['get', '/v1/admin/tickets'],
    ['get', '/v1/admin/enquiries'],
  ] as const)('%s %s needs a module grant (403)', async (method, url) => {
    const res = await request(app)[method](url).set(auth(NOGRANTS));
    expect(res.status).toBe(403);
  });

  it('support:view alone cannot change a ticket', async () => {
    const res = await request(app)
      .patch('/v1/admin/tickets/11111111-1111-4111-8111-111111111111')
      .set(auth(SUPPORT_VIEW))
      .send({ status: 'CLOSED', version: 1 });
    expect(res.status).toBe(403);
  });
});

describe('ticket status transitions', () => {
  it('allows the defined forward moves and staying put', () => {
    expect(canMoveTicket('OPEN', 'ASSIGNED')).toBe(true);
    expect(canMoveTicket('IN_PROGRESS', 'RESOLVED')).toBe(true);
    expect(canMoveTicket('RESOLVED', 'CLOSED')).toBe(true);
    expect(canMoveTicket('WAITING', 'WAITING')).toBe(true);
  });

  it('never reopens a closed ticket', () => {
    for (const to of ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'RESOLVED'] as const) {
      expect(canMoveTicket('CLOSED', to)).toBe(false);
    }
  });
});
