import { Router, type Request } from 'express';
import { z } from 'zod';
import { uuidSchema } from '@nestovin/contracts';
import type { AppDeps } from '../../http/context';
import { parseParam, parseQuery, rateLimit, validateBody } from '../../http/middleware';
import { forbidden, unauthenticated } from '../../lib/errors';
import { adminOf } from '../../http/context';
import { toDbClaims } from '../../auth/permissions';
import { withTx } from '../../db/database';
import { NotificationService } from './service';

const deviceSchema = z.object({ token: z.string().min(20).max(4096), platform: z.enum(['android', 'ios']) });

/** Super Admin: delivery status of queued notifications (no message bodies with personal data are stored). */
/** Shows enough of an email, phone or device id to identify it, without exposing it in full. */
export function maskRecipient(v: string): string {
  if (v.includes('@')) {
    const [user = '', domain = ''] = v.split('@');
    return `${user.slice(0, 2)}***@${domain}`;
  }
  if (/^\+?\d{8,}$/.test(v)) return `${v.slice(0, 5)}****${v.slice(-3)}`;
  return v.length > 10 ? `${v.slice(0, 6)}…${v.slice(-4)}` : v;
}

export function notificationAdminRoutes(deps: AppDeps): Router {
  const r = Router();
  r.get('/notifications/outbox', async (req, res) => {
    const actor = adminOf(req);
    if (!actor.isSuperAdmin) throw forbidden('Only the Super Admin can view notification delivery');
    const q = parseQuery(z.object({ status: z.enum(['PENDING', 'SENT', 'FAILED', 'DEAD', 'SKIPPED']).optional() }), req);
    const rows = await withTx(deps.db, toDbClaims(actor), (trx) => {
      let qb = trx.selectFrom('app.notification_outbox').select(['id', 'event_type', 'channel', 'recipient', 'status', 'attempts', 'last_error', 'created_at', 'sent_at']);
      if (q.status) qb = qb.where('status', '=', q.status);
      return qb.orderBy('created_at', 'desc').limit(200).execute();
    });
    res.json({
      items: rows.map((x) => ({ id: x.id, eventType: x.event_type, channel: x.channel, recipient: maskRecipient(x.recipient), status: x.status, attempts: x.attempts, lastError: x.last_error, createdAt: new Date(x.created_at).toISOString(), sentAt: x.sent_at ? new Date(x.sent_at).toISOString() : null })),
    });
  });
  return r;
}

/** Mounted inside /v1/resident and /v1/employee (their auth middleware runs first). */
export function inboxRoutes(deps: AppDeps, kind: 'resident' | 'employee'): Router {
  const r = Router();
  const svc = new NotificationService(deps.db);
  const owner = (req: Request) => {
    const id = kind === 'resident' ? req.resident?.id : req.employee?.id;
    if (!id) throw unauthenticated();
    return { kind, id };
  };
  r.post(
    '/devices',
    rateLimit(deps, { name: `device-${kind}`, limit: 30, windowSeconds: 3600, keyFn: (req) => (kind === 'resident' ? req.resident?.id : req.employee?.id) ?? null }),
    validateBody(deviceSchema),
    async (req, res) => {
      res.status(201).json(await svc.registerDevice(owner(req), req.body.token, req.body.platform));
    },
  );
  r.post('/devices/remove', validateBody(z.object({ token: z.string().min(20).max(4096) })), async (req, res) => {
    res.json(await svc.unregisterDevice(owner(req), req.body.token));
  });
  r.get('/notifications', async (req, res) => {
    const q = parseQuery(z.object({ unread: z.enum(['true', 'false']).default('false') }), req);
    res.json(await svc.inbox(owner(req), q.unread === 'true'));
  });
  r.post('/notifications/read-all', async (req, res) => {
    res.json(await svc.markRead(owner(req), 'all'));
  });
  r.post('/notifications/:id/read', async (req, res) => {
    res.json(await svc.markRead(owner(req), parseParam(uuidSchema, req.params.id)));
  });
  return r;
}
