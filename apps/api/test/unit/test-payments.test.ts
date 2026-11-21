import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { demoLoginResponseSchema, testCompletePaymentSchema, testModeSchema } from '@nestovin/contracts';
import { createApp } from '../../src/app';
import { loadEnv } from '../../src/config/env';
import { createRazorpay, createTestPaymentProvider, isTestPaymentProvider } from '../../src/integrations/razorpay';
import { TEST_ENV, fakeDeps } from '../helpers/fake-deps';

describe('dev-only test payments', () => {
  it('is off by default and refuses to start in production', () => {
    expect(loadEnv({ ...TEST_ENV } as NodeJS.ProcessEnv).TEST_PAYMENTS_ENABLED).toBe(false);
    expect(loadEnv({ ...TEST_ENV, TEST_PAYMENTS_ENABLED: 'true' } as NodeJS.ProcessEnv).TEST_PAYMENTS_ENABLED).toBe(true);
    expect(() =>
      loadEnv({ ...TEST_ENV, NODE_ENV: 'production', TEST_PAYMENTS_ENABLED: 'true', DATABASE_SSL_CA_PATH: '/ca.pem', CORS_ORIGINS: 'https://x.example' } as NodeJS.ProcessEnv),
    ).toThrow(/TEST_PAYMENTS_ENABLED/);
    expect(() =>
      loadEnv({ ...TEST_ENV, NODE_ENV: 'production', TEST_PAYMENTS_ENABLED: 'false', DATABASE_SSL_CA_PATH: '/ca.pem', CORS_ORIGINS: 'https://x.example' } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it('test provider: test_ orders, captured test_pay_ payments for the exact amount, boot-secret signatures', async () => {
    const p = createTestPaymentProvider();
    expect(isTestPaymentProvider(p)).toBe(true);
    expect(isTestPaymentProvider(createRazorpay({ keyId: 'rzp_test_x', keySecret: 'secret-123456' }))).toBe(false);
    expect(isTestPaymentProvider(null)).toBe(false);

    const order = await p.createOrder({ amountPaise: 500000, currency: 'INR', receipt: 'r', notes: {} });
    expect(order.id).toMatch(/^test_order_[0-9a-f]+$/);
    const paid = p.capture({ orderId: order.id, amountPaise: 500000, currency: 'INR' });
    expect(paid.providerPaymentId).toMatch(/^test_pay_[0-9a-f]+$/);
    expect(p.verifyCheckoutSignature(order.id, paid.providerPaymentId, paid.signature)).toBe(true);
    expect(p.verifyCheckoutSignature(order.id, paid.providerPaymentId, 'forged')).toBe(false);
    // Another boot (another secret) cannot validate this signature.
    expect(createTestPaymentProvider().verifyCheckoutSignature(order.id, paid.providerPaymentId, paid.signature)).toBe(false);
    expect(await p.fetchPayment(paid.providerPaymentId)).toMatchObject({ orderId: order.id, amountPaise: 500000, currency: 'INR', status: 'captured' });
    expect(await p.fetchOrderPayments(order.id)).toHaveLength(1);
    await expect(p.fetchPayment('pay_unknown')).rejects.toThrow();
    expect(p.verifyWebhookSignature(Buffer.from('{}'), 'x')).toBe(false);
    expect(() => p.capture({ orderId: 'order_real123', amountPaise: 1, currency: 'INR' })).toThrow();
  });

  it('contracts', () => {
    expect(testCompletePaymentSchema.safeParse({ paymentOrderId: 'nope' }).success).toBe(false);
    expect(testCompletePaymentSchema.safeParse({ paymentOrderId: '6f1c2a8e-4b1d-4c3e-9f2a-1b2c3d4e5f60' }).success).toBe(true);
    expect(testModeSchema.parse({ testPayments: true })).toEqual({ testPayments: true });
  });
});

describe('dev-only demo login', () => {
  const prod = { ...TEST_ENV, NODE_ENV: 'production', DATABASE_SSL_CA_PATH: '/ca.pem', CORS_ORIGINS: 'https://x.example' };

  it('is off by default, needs a phone, and refuses to start in production', () => {
    expect(loadEnv({ ...TEST_ENV } as NodeJS.ProcessEnv).DEMO_LOGIN_ENABLED).toBe(false);
    expect(() => loadEnv({ ...TEST_ENV, DEMO_LOGIN_ENABLED: 'true' } as NodeJS.ProcessEnv)).toThrow(/DEMO_RESIDENT_PHONE/);
    expect(() => loadEnv({ ...TEST_ENV, DEMO_LOGIN_ENABLED: 'true', DEMO_RESIDENT_PHONE: '9999900001' } as NodeJS.ProcessEnv)).toThrow(/DEMO_RESIDENT_PHONE/);
    expect(loadEnv({ ...TEST_ENV, DEMO_LOGIN_ENABLED: 'true', DEMO_RESIDENT_PHONE: '+919999900001' } as NodeJS.ProcessEnv).DEMO_LOGIN_ENABLED).toBe(true);
    expect(() => loadEnv({ ...prod, DEMO_LOGIN_ENABLED: 'true', DEMO_RESIDENT_PHONE: '+919999900001' } as NodeJS.ProcessEnv)).toThrow(/DEMO_LOGIN_ENABLED/);
  });

  it('answers 404 when disabled, before any database access', async () => {
    const res = await request(createApp(fakeDeps({}))).post('/v1/public/demo-login').send({});
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('contract carries only the token hash', () => {
    expect(demoLoginResponseSchema.parse({ tokenHash: 'abc', type: 'magiclink' })).toEqual({ tokenHash: 'abc', type: 'magiclink' });
    expect(demoLoginResponseSchema.safeParse({ tokenHash: 'abc', type: 'signup' }).success).toBe(false);
  });
});
