import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { monthBounds, prorate } from '../../src/modules/payroll/service';
import { actor, fakeDeps } from '../helpers/fake-deps';

describe('fixed monthly proration (ADR-014)', () => {
  it('knows month lengths', () => {
    expect(monthBounds('2026-02').days).toBe(28);
    expect(monthBounds('2028-02').days).toBe(29);
    expect(monthBounds('2026-11')).toEqual({ start: '2026-11-01', end: '2026-11-30', days: 30 });
  });
  it('pays the full amount for a full month', () => {
    const r = prorate('2026-11', [{ monthlyAmountPaise: 1500000, from: '2026-01-01', to: null }], { from: null, to: null });
    expect(r).toMatchObject({ payableDays: 30, basePaise: 1500000 });
  });
  it('prorates joining mid-month by calendar days', () => {
    const r = prorate('2026-11', [{ monthlyAmountPaise: 1500000, from: '2026-01-01', to: null }], { from: '2026-11-16', to: null });
    expect(r).toMatchObject({ payableDays: 15, basePaise: 750000 });
  });
  it('splits a rate change inside the month and rounds once, half up', () => {
    const r = prorate(
      '2026-11',
      [
        { monthlyAmountPaise: 1000000, from: '2026-01-01', to: '2026-11-10' },
        { monthlyAmountPaise: 1300001, from: '2026-11-11', to: null },
      ],
      { from: null, to: null },
    );
    expect(r.segments.map((s) => s.days)).toEqual([10, 20]);
    // (1000000*10 + 1300001*20) / 30 = 1200000.666… -> 1200001
    expect(r.basePaise).toBe(1200001);
  });
  it('stops at the exit date and pays nothing without a salary', () => {
    expect(prorate('2026-11', [{ monthlyAmountPaise: 3000000, from: '2026-01-01', to: null }], { from: null, to: '2026-11-03' }).basePaise).toBe(300000);
    expect(prorate('2026-11', [], { from: null, to: null })).toMatchObject({ payableDays: 0, basePaise: 0 });
  });
});

const NOGRANTS = '33333333-3333-4333-8333-333333333333';
const VIEWER = '99999999-9999-4999-8999-999999999999';
const app = createApp(
  fakeDeps({
    [NOGRANTS]: { status: 'ACTIVE', actor: actor({ id: NOGRANTS }) },
    [VIEWER]: { status: 'ACTIVE', actor: actor({ id: VIEWER, grants: ['finance_payroll:view'] }) },
  }),
);
const ID = '11111111-1111-4111-8111-111111111111';
const auth = (id: string) => ({ Authorization: `Bearer token:aal2:${id}` });

describe('payroll permissions', () => {
  it('needs finance_payroll grants for each step', async () => {
    expect((await request(app).get('/v1/admin/payroll-runs').set(auth(NOGRANTS))).status).toBe(403);
    expect((await request(app).post('/v1/admin/payroll-runs').set(auth(VIEWER)).send({ month: '2026-11' })).status).toBe(403);
    expect((await request(app).post(`/v1/admin/payroll-runs/${ID}/approve`).set(auth(VIEWER))).status).toBe(403);
    expect((await request(app).post(`/v1/admin/payroll-lines/${ID}/payments`).set(auth(VIEWER)).send({})).status).toBe(403);
    expect((await request(app).get(`/v1/admin/payroll-runs/${ID}/export`).set(auth(VIEWER))).status).toBe(403);
  });
});
