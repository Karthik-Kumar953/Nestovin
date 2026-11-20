import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Resident phone OTP (RES-01, ADR-012): Supabase Auth generates the OTP and
 * calls our "Send SMS" hook; we deliver it through MSG91 using the
 * DLT-registered template. Both pieces are enabled purely by environment keys.
 */
export interface SmsSender {
  sendOtp(phoneE164: string, otp: string): Promise<void>;
}

/** MSG91 Flow API with a DLT-approved OTP template. */
export function createMsg91(opts: { authKey: string; templateId: string; otpVariable: string }): SmsSender {
  return {
    async sendOtp(phoneE164, otp) {
      const mobiles = phoneE164.replace(/^\+/, '');
      const res = await fetch('https://control.msg91.com/api/v5/flow', {
        method: 'POST',
        headers: { authkey: opts.authKey, 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ template_id: opts.templateId, short_url: '0', recipients: [{ mobiles, [opts.otpVariable]: otp }] }),
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
      if (!res.ok || json.type === 'error') throw new Error(`MSG91 ${res.status}: ${json.message ?? 'send failed'}`);
    },
  };
}

/**
 * Standard Webhooks verification used by Supabase Auth hooks.
 * Secret format: "v1,whsec_<base64>"; signature header: "v1,<base64> v1,<base64>".
 * Rejects stale timestamps (5 minutes) to stop replays.
 */
export function verifyStandardWebhook(
  secret: string,
  headers: { id?: string | undefined; timestamp?: string | undefined; signature?: string | undefined },
  rawBody: Buffer,
  now = Date.now(),
): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return false;
  const key = Buffer.from(secret.replace(/^v1,/, '').replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${headers.id}.${headers.timestamp}.${rawBody.toString('utf8')}`).digest('base64');
  return headers.signature.split(' ').some((part) => {
    const sig = part.split(',')[1] ?? '';
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}
