import express, { Router } from 'express';
import type { Env } from '../../config/env';
import type { Logger } from '../../lib/logger';
import { verifyStandardWebhook, type SmsSender } from '../../integrations/sms';

/**
 * POST /v1/hooks/supabase/send-sms — Supabase Auth "Send SMS" hook.
 * Configure in Supabase: Authentication -> Hooks -> Send SMS -> HTTPS,
 * URL https://<api>/v1/hooks/supabase/send-sms, and copy the generated secret
 * into SUPABASE_SMS_HOOK_SECRET. The OTP is never logged.
 */
export function supabaseHookRoutes(env: Env, sms: SmsSender | null, logger: Logger): Router {
  const r = Router();
  r.post('/supabase/send-sms', express.raw({ type: '*/*', limit: '16kb' }), async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!env.SUPABASE_SMS_HOOK_SECRET || !sms) {
      res.status(503).json({ error: { http_code: 503, message: 'SMS delivery is not configured' } });
      return;
    }
    const ok = verifyStandardWebhook(env.SUPABASE_SMS_HOOK_SECRET, { id: req.header('webhook-id'), timestamp: req.header('webhook-timestamp'), signature: req.header('webhook-signature') }, raw);
    if (!ok) {
      logger.warn('send-sms hook with invalid signature rejected');
      res.status(401).json({ error: { http_code: 401, message: 'Invalid signature' } });
      return;
    }
    let body: { user?: { phone?: string }; sms?: { otp?: string } };
    try {
      body = JSON.parse(raw.toString('utf8')) as typeof body;
    } catch {
      res.status(400).json({ error: { http_code: 400, message: 'Invalid payload' } });
      return;
    }
    const phone = body.user?.phone ? (body.user.phone.startsWith('+') ? body.user.phone : `+${body.user.phone}`) : '';
    const otp = body.sms?.otp ?? '';
    if (!/^\+[1-9]\d{7,14}$/.test(phone) || !/^\d{4,10}$/.test(otp)) {
      res.status(400).json({ error: { http_code: 400, message: 'Missing phone or OTP' } });
      return;
    }
    try {
      await sms.sendOtp(phone, otp);
      res.json({});
    } catch (err) {
      logger.error({ err: String((err as Error).message) }, 'OTP SMS delivery failed');
      res.status(502).json({ error: { http_code: 502, message: 'Could not send the SMS. Please try again.' } });
    }
  });
  return r;
}
