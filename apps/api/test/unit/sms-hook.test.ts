import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { createMsg91, verifyStandardWebhook, type SmsSender } from '../../src/integrations/sms';
import { fakeDeps } from '../helpers/fake-deps';

const SECRET = 'v1,whsec_' + Buffer.from('a-very-secret-key-for-tests-123456').toString('base64');
function sign(body: string, id = 'msg_1', ts = Math.floor(Date.now() / 1000)) {
  const key = Buffer.from(SECRET.replace('v1,whsec_', ''), 'base64');
  const sig = createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
  return { 'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': `v1,${sig}` };
}

describe('Standard Webhooks verification (Supabase Auth hooks)', () => {
  const body = '{"user":{"phone":"919876543210"},"sms":{"otp":"123456"}}';
  it('accepts a valid signature and rejects tampering or stale timestamps', () => {
    const h = sign(body);
    expect(verifyStandardWebhook(SECRET, { id: h['webhook-id'], timestamp: h['webhook-timestamp'], signature: h['webhook-signature'] }, Buffer.from(body))).toBe(true);
    expect(verifyStandardWebhook(SECRET, { id: h['webhook-id'], timestamp: h['webhook-timestamp'], signature: h['webhook-signature'] }, Buffer.from(body + ' '))).toBe(false);
    const old = sign(body, 'msg_1', Math.floor(Date.now() / 1000) - 3600);
    expect(verifyStandardWebhook(SECRET, { id: old['webhook-id'], timestamp: old['webhook-timestamp'], signature: old['webhook-signature'] }, Buffer.from(body))).toBe(false);
  });
});

describe('POST /v1/hooks/supabase/send-sms', () => {
  const body = JSON.stringify({ user: { phone: '919876543210' }, sms: { otp: '482913' } });
  it('answers 503 until SMS is configured', async () => {
    const res = await request(createApp(fakeDeps({}))).post('/v1/hooks/supabase/send-sms').set('Content-Type', 'application/json').send(body);
    expect(res.status).toBe(503);
  });
  it('verifies the signature and sends the OTP to the E.164 phone', async () => {
    const sent: [string, string][] = [];
    const sms: SmsSender = { async sendOtp(p, o) { sent.push([p, o]); } };
    const app = createApp({ ...fakeDeps({}, { SUPABASE_SMS_HOOK_SECRET: SECRET }), sms });
    const bad = await request(app).post('/v1/hooks/supabase/send-sms').set('Content-Type', 'application/json').set({ ...sign(body), 'webhook-signature': 'v1,AAAA' }).send(body);
    expect(bad.status).toBe(401);
    const ok = await request(app).post('/v1/hooks/supabase/send-sms').set('Content-Type', 'application/json').set(sign(body)).send(body);
    expect(ok.status).toBe(200);
    expect(sent).toEqual([['+919876543210', '482913']]);
  });
});

describe('MSG91 adapter', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('calls the Flow API with the DLT template and OTP variable', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ type: 'success' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await createMsg91({ authKey: 'key-123456789', templateId: 'tmpl-1', otpVariable: 'OTP' }).sendOtp('+919876543210', '111222');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://control.msg91.com/api/v5/flow');
    expect(JSON.parse(String(init.body))).toEqual({ template_id: 'tmpl-1', short_url: '0', recipients: [{ mobiles: '919876543210', OTP: '111222' }] });
  });
});
