import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { addDays, splitInitial } from '../../src/modules/bookings/pricing';
import { hmacHex, safeEqualHex } from '../../src/integrations/razorpay';
import { actor, fakeDeps } from '../helpers/fake-deps';

describe('initial commitment split (ADR-015)', () => {
  it('uses the whole percentage and keeps initial + remaining = total', () => {
    expect(splitInitial(400000, 30)).toEqual({ initial: 120000, remaining: 280000 });
    expect(splitInitial(333, 50)).toEqual({ initial: 167, remaining: 166 }); // 166.5 rounds half up
    expect(splitInitial(999, 1)).toEqual({ initial: 10, remaining: 989 }); // 9.99 -> 10
    expect(splitInitial(500000, null)).toEqual({ initial: 500000, remaining: 0 });
    for (const [t, p] of [[1, 99], [12345678, 37], [101, 33]] as const) {
      const r = splitInitial(t, p);
      expect(r.initial + r.remaining).toBe(t);
    }
  });

  it('rejects percentages outside 1–99 and non-integers', () => {
    expect(() => splitInitial(1000, 0)).toThrow();
    expect(() => splitInitial(1000, 100)).toThrow();
    expect(() => splitInitial(1000, 12.5)).toThrow();
  });

  it('adds calendar days across month ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 30)).toBe('2027-01-30');
  });
});

describe('Razorpay signatures', () => {
  it('matches the documented HMAC-SHA256 hex format', () => {
    const sig = hmacHex('secret', 'order_1|pay_1');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(safeEqualHex(sig, hmacHex('secret', 'order_1|pay_1'))).toBe(true);
    expect(safeEqualHex(sig, hmacHex('other', 'order_1|pay_1'))).toBe(false);
  });
});

const NOGRANTS = '33333333-3333-4333-8333-333333333333';
const SCHED_EDIT = '77777777-7777-4777-8777-777777777777';
const app = createApp(
  fakeDeps({
    [NOGRANTS]: { status: 'ACTIVE', actor: actor({ id: NOGRANTS }) },
    [SCHED_EDIT]: { status: 'ACTIVE', actor: actor({ id: SCHED_EDIT, grants: ['scheduling:view', 'scheduling:edit'] }) },
  }),
);
const auth = (id: string) => ({ Authorization: `Bearer token:aal2:${id}` });
const ID = '11111111-1111-4111-8111-111111111111';

describe('ADM-08 / ADM-10 permissions', () => {
  it.each([
    ['get', `/v1/admin/communities/${ID}/demand-cycles`],
    ['post', `/v1/admin/demand-cycles/${ID}/publish`],
    ['get', '/v1/admin/payments'],
    ['get', '/v1/admin/payment-exceptions'],
    ['post', `/v1/admin/payment-transactions/${ID}/refunds`],
    ['get', `/v1/admin/communities/${ID}/slots`],
    ['get', '/v1/admin/bookings'],
  ] as const)('%s %s needs a module grant (403)', async (method, url) => {
    expect((await request(app)[method](url).set(auth(NOGRANTS)).send({})).status).toBe(403);
  });

  it('publishing a slot needs scheduling:publish, not just edit', async () => {
    const res = await request(app).patch(`/v1/admin/slots/${ID}`).set(auth(SCHED_EDIT)).send({ status: 'PUBLISHED', version: 1 });
    expect(res.status).toBe(403);
  });

  it('rejects webhooks when payments are not configured', async () => {
    const res = await request(app).post('/v1/webhooks/razorpay').set('Content-Type', 'application/json').send('{"event":"payment.captured"}');
    expect(res.status).toBe(400);
  });
});
