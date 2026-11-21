import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDemandCycleSchema, createDemandRequestSchema, updateDemandCycleSchema, verifyPaymentSchema, NON_REFUNDABLE_DISCLOSURE } from '@nestovin/contracts';
import { createApp } from '../../src/app';
import { fakeDeps } from '../helpers/fake-deps';

/* PRD PAY-01…04 and PAY-08, request-contract layer. The DB layer is in test/integration/pay-rules.test.ts. */

const UUID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const cycle = (initialPct: unknown) => ({
  name: 'QA cycle',
  opensAt: '2026-12-01T00:00:00.000Z',
  closesAt: '2026-12-08T00:00:00.000Z',
  initialPct,
  planIds: [UUID],
});

describe('initial payment percentage (PAY-01…03)', () => {
  it.each([
    ['PAY-01: 0%', 0],
    ['PAY-02: 100%', 100],
    ['PAY-03: above 100', 101],
    ['PAY-03: negative', -5],
    ['PAY-03: non-numeric', 'thirty'],
    ['PAY-03: numeric string', '30'],
    ['PAY-03: fraction', 12.5],
    ['PAY-03: NaN', Number.NaN],
  ])('%s is rejected on create and update', (_name, pct) => {
    expect(createDemandCycleSchema.safeParse(cycle(pct)).success).toBe(false);
    expect(updateDemandCycleSchema.safeParse({ initialPct: pct, version: 1 }).success).toBe(false);
  });

  it.each([1, 30, 99])('%i%% is accepted', (pct) => {
    expect(createDemandCycleSchema.safeParse(cycle(pct)).success).toBe(true);
  });
});

describe('client-supplied money fields are dropped (PAY-04, PAY-08)', () => {
  it('PAY-04: a demand request cannot carry its own percentage or amounts', () => {
    const parsed = createDemandRequestSchema.parse({
      cycleId: UUID,
      selection: { planId: UUID, serviceId: UUID, addonComponentIds: [] },
      preferredWindowIds: [UUID],
      acceptNonRefundable: true,
      disclosureVersion: NON_REFUNDABLE_DISCLOSURE.version,
      initialPct: 1,
      amountPaise: 100,
      totalPaise: 100,
      initialDuePaise: 1,
    });
    expect(Object.keys(parsed).sort()).toEqual(['acceptNonRefundable', 'cycleId', 'disclosureVersion', 'preferredWindowIds', 'selection']);
  });

  it('PAY-04: the non-refundable terms must be accepted explicitly', () => {
    const base = { cycleId: UUID, selection: { planId: UUID, serviceId: UUID, addonComponentIds: [] }, preferredWindowIds: [UUID], disclosureVersion: 'v1' };
    expect(createDemandRequestSchema.safeParse({ ...base, acceptNonRefundable: false }).success).toBe(false);
    expect(createDemandRequestSchema.safeParse(base).success).toBe(false);
  });

  it('PAY-08: "paid: true" from the client is not part of payment verification', () => {
    const parsed = verifyPaymentSchema.parse({ paymentOrderId: UUID, providerPaymentId: 'pay_1', signature: 'sig', paid: true, status: 'PAID', amountPaise: 1 });
    expect(parsed).toEqual({ paymentOrderId: UUID, providerPaymentId: 'pay_1', signature: 'sig' });
    expect(verifyPaymentSchema.safeParse({ paymentOrderId: UUID, paid: true }).success).toBe(false);
  });
});

describe('Razorpay webhook endpoint (PAY-09)', () => {
  it('answers 400 when payments are not configured or the signature is missing', async () => {
    const app = createApp(fakeDeps({}));
    const res = await request(app).post('/v1/webhooks/razorpay').set('Content-Type', 'application/json').send('{"event":"payment.captured","payload":{}}');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ status: 'rejected' });
  });

  it('answers 400 for a non-JSON body', async () => {
    const app = createApp(fakeDeps({}));
    const res = await request(app).post('/v1/webhooks/razorpay').set('Content-Type', 'application/json').set('x-razorpay-signature', 'abc').send('not json');
    expect(res.status).toBe(400);
  });
});
