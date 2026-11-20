import express, { Router } from 'express';
import { z } from 'zod';
import {
  allocateSchema,
  approveRefundSchema,
  createBookingSchema,
  createDemandCycleSchema,
  createDemandRequestSchema,
  createSlotSetSchema,
  extendBalanceSchema,
  extendCycleSchema,
  paginationQuerySchema,
  resolveExceptionSchema,
  settingsSchema,
  slotInputSchema,
  updateDemandCycleSchema,
  updateSlotSchema,
  uuidSchema,
  verifyPaymentSchema,
  versionOnlySchema,
} from '@nestovin/contracts';
import type { AppDeps } from '../../http/context';
import { adminOf, residentOf } from '../../http/context';
import { authorize, parseParam, parseQuery, rateLimit, validateBody } from '../../http/middleware';
import { forbidden } from '../../lib/errors';
import { BookingAdminService } from './admin-service';
import type { PaymentService } from './payments';
import { ResidentBookingService } from './resident-service';

const id = (v: unknown, name = 'id') => parseParam(uuidSchema, v, name);
const idemKey = (req: express.Request) => {
  const k = req.header('idempotency-key');
  return k && /^[A-Za-z0-9_-]{8,100}$/.test(k) ? k : undefined;
};

/** Resident booking routes; mounted inside /v1/resident (requireResident already applied). */
export function residentBookingRoutes(deps: AppDeps, payments: PaymentService): Router {
  const r = Router();
  const svc = new ResidentBookingService(deps.db, payments);
  const limit = rateLimit(deps, { name: 'checkout', limit: 30, windowSeconds: 3600, keyFn: (req) => req.resident?.id ?? null });

  r.get('/booking-options', async (req, res) => {
    res.json(await svc.options(residentOf(req)));
  });
  r.get('/demand-requests', async (req, res) => {
    res.json({ items: await svc.demandRequests(residentOf(req)) });
  });
  r.post('/demand-requests', limit, validateBody(createDemandRequestSchema), async (req, res) => {
    res.status(201).json(await svc.createDemandRequest(residentOf(req), req.requestId, req.body, idemKey(req)));
  });
  r.post('/demand-requests/:id/cancel', async (req, res) => {
    res.json({ items: await svc.cancelDemandRequest(residentOf(req), req.requestId, id(req.params.id)) });
  });
  r.post('/demand-requests/:id/pay', limit, async (req, res) => {
    res.json(await svc.payAgain(residentOf(req), { type: 'DEMAND_REQUEST', id: id(req.params.id) }, idemKey(req)));
  });
  r.get('/bookings', async (req, res) => {
    res.json({ items: await svc.bookings(residentOf(req)) });
  });
  r.post('/bookings', limit, validateBody(createBookingSchema), async (req, res) => {
    res.status(201).json(await svc.createBooking(residentOf(req), req.requestId, req.body, idemKey(req)));
  });
  r.post('/bookings/:id/pay', limit, async (req, res) => {
    res.json(await svc.payAgain(residentOf(req), { type: 'BOOKING', id: id(req.params.id) }, idemKey(req)));
  });
  r.post('/subscriptions/:id/renew', limit, async (req, res) => {
    res.status(201).json(await svc.renew(residentOf(req), req.requestId, id(req.params.id), idemKey(req)));
  });
  r.post('/payments/verify', limit, validateBody(verifyPaymentSchema), async (req, res) => {
    res.json(await svc.verifyPayment(residentOf(req), req.body));
  });
  return r;
}

const bookingQuery = paginationQuerySchema.extend({
  status: z.enum(['PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'REVIEW_REQUIRED']).optional(),
  communityId: uuidSchema.optional(),
});
const paymentQuery = paginationQuerySchema.extend({ status: z.enum(['CREATED', 'PAID', 'FAILED', 'EXPIRED', 'REVIEW_REQUIRED']).optional() });

/** ADM-08 + ADM-10 routes; mounted under /v1/admin behind requireAdmin. */
export function bookingAdminRoutes(deps: AppDeps): Router {
  const r = Router();
  const svc = new BookingAdminService(deps.db);

  const anyOf = (mods: ('demand_payments' | 'scheduling')[]) => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const a = adminOf(req);
    if (a.isSuperAdmin || mods.some((m) => a.grants.has(`${m}:view`))) return next();
    throw forbidden();
  };
  r.get('/community-options', anyOf(['demand_payments', 'scheduling']), async (req, res) => {
    res.json({ items: await svc.communityOptions(adminOf(req)) });
  });
  r.get('/communities/:id/published-plans', authorize('demand_payments', 'view'), async (req, res) => {
    res.json({ items: await svc.publishedPlans(adminOf(req), id(req.params.id)) });
  });

  // ADM-10 continuous slots
  r.get('/communities/:id/slots', authorize('scheduling', 'view'), async (req, res) => {
    res.json({ items: await svc.listSlots(adminOf(req), id(req.params.id)) });
  });
  r.post('/communities/:id/slots', authorize('scheduling', 'create'), validateBody(slotInputSchema), async (req, res) => {
    res.status(201).json({ items: await svc.createSlot(adminOf(req), req.requestId, id(req.params.id), req.body) });
  });
  r.patch('/slots/:id', authorize('scheduling', 'edit'), validateBody(updateSlotSchema), async (req, res) => {
    const body = req.body as z.infer<typeof updateSlotSchema>;
    // Publishing/withdrawing a continuous slot needs scheduling:publish.
    if (body.status && body.status !== 'DRAFT' && !adminOf(req).isSuperAdmin && !adminOf(req).grants.has('scheduling:publish')) throw forbidden();
    res.json(await svc.updateSlot(adminOf(req), req.requestId, id(req.params.id), body));
  });
  r.get('/booking-settings', authorize('scheduling', 'view'), async (_req, res) => {
    res.json(await svc.getSettings());
  });
  r.put('/booking-settings', authorize('scheduling', 'edit'), validateBody(settingsSchema), async (req, res) => {
    res.json(await svc.setSettings(adminOf(req), req.requestId, req.body));
  });

  // ADM-08 demand cycles
  r.get('/communities/:id/demand-cycles', authorize('demand_payments', 'view'), async (req, res) => {
    res.json({ items: await svc.listCycles(adminOf(req), id(req.params.id)) });
  });
  r.post('/communities/:id/demand-cycles', authorize('demand_payments', 'create'), validateBody(createDemandCycleSchema), async (req, res) => {
    res.status(201).json(await svc.createCycle(adminOf(req), req.requestId, id(req.params.id), req.body));
  });
  r.get('/demand-cycles/:id', authorize('demand_payments', 'view'), async (req, res) => {
    res.json(await svc.getCycle(adminOf(req), id(req.params.id)));
  });
  r.patch('/demand-cycles/:id', authorize('demand_payments', 'edit'), validateBody(updateDemandCycleSchema), async (req, res) => {
    res.json(await svc.updateCycle(adminOf(req), req.requestId, id(req.params.id), req.body));
  });
  r.post('/demand-cycles/:id/publish', authorize('demand_payments', 'publish'), validateBody(versionOnlySchema), async (req, res) => {
    res.json(await svc.publishCycle(adminOf(req), req.requestId, id(req.params.id), req.body.version));
  });
  r.post('/demand-cycles/:id/close', authorize('demand_payments', 'publish'), validateBody(versionOnlySchema), async (req, res) => {
    res.json(await svc.closeCycle(adminOf(req), req.requestId, id(req.params.id), req.body.version));
  });
  r.post('/demand-cycles/:id/extend', authorize('demand_payments', 'publish'), validateBody(extendCycleSchema), async (req, res) => {
    res.json(await svc.extendCycle(adminOf(req), req.requestId, id(req.params.id), req.body));
  });
  r.get('/demand-cycles/:id/summary', authorize('demand_payments', 'view'), async (req, res) => {
    res.json(await svc.summary(adminOf(req), id(req.params.id)));
  });
  r.get('/demand-cycles/:id/requests', authorize('demand_payments', 'view'), async (req, res) => {
    const q = parseQuery(z.object({ status: z.string().max(30).optional() }), req);
    res.json({ items: await svc.demandRequests(adminOf(req), id(req.params.id), q.status) });
  });

  // Slot sets (demand-led)
  r.get('/demand-cycles/:id/slot-sets', authorize('demand_payments', 'view'), async (req, res) => {
    res.json({ items: await svc.slotSets(adminOf(req), id(req.params.id)) });
  });
  r.post('/demand-cycles/:id/slot-sets', authorize('demand_payments', 'create'), validateBody(createSlotSetSchema), async (req, res) => {
    res.status(201).json(await svc.createSlotSet(adminOf(req), req.requestId, id(req.params.id), req.body));
  });
  r.post('/slot-sets/:id/slots', authorize('demand_payments', 'edit'), validateBody(slotInputSchema), async (req, res) => {
    res.status(201).json(await svc.addSetSlot(adminOf(req), req.requestId, id(req.params.id), req.body));
  });
  r.post('/slot-sets/:id/allocations', authorize('demand_payments', 'edit'), validateBody(allocateSchema), async (req, res) => {
    res.json(await svc.allocate(adminOf(req), req.requestId, id(req.params.id), req.body));
  });
  r.post('/slot-sets/:id/publish', authorize('demand_payments', 'publish'), validateBody(versionOnlySchema), async (req, res) => {
    res.json(await svc.publishSlotSet(adminOf(req), req.requestId, id(req.params.id), req.body.version));
  });
  r.post('/slot-sets/:id/extend-deadline', authorize('demand_payments', 'publish'), validateBody(extendBalanceSchema), async (req, res) => {
    res.json(await svc.extendBalance(adminOf(req), req.requestId, id(req.params.id), req.body));
  });

  // Bookings & payments
  r.get('/bookings', authorize('demand_payments', 'view'), async (req, res) => {
    res.json(await svc.bookings(adminOf(req), parseQuery(bookingQuery, req)));
  });
  r.post('/bookings/:id/remind', authorize('demand_payments', 'edit'), async (req, res) => {
    res.json(await svc.remind(adminOf(req), req.requestId, id(req.params.id)));
  });
  r.get('/payments', authorize('demand_payments', 'view'), async (req, res) => {
    res.json(await svc.payments(adminOf(req), parseQuery(paymentQuery, req)));
  });
  r.get('/payment-exceptions', authorize('demand_payments', 'view'), async (req, res) => {
    const q = parseQuery(z.object({ status: z.enum(['OPEN', 'RESOLVED']).default('OPEN') }), req);
    res.json({ items: await svc.exceptions(adminOf(req), q.status) });
  });
  r.post('/payment-exceptions/:id/resolve', authorize('demand_payments', 'edit'), validateBody(resolveExceptionSchema), async (req, res) => {
    res.json(await svc.resolveException(adminOf(req), req.requestId, id(req.params.id), req.body.note));
  });
  r.post('/payment-transactions/:id/refunds', authorize('demand_payments', 'approve'), validateBody(approveRefundSchema), async (req, res) => {
    res.status(201).json(await svc.approveRefund(adminOf(req), req.requestId, id(req.params.id), req.body));
  });

  return r;
}

/** POST /v1/webhooks/razorpay — raw body (signature is over the exact bytes). */
export function razorpayWebhookRoutes(payments: PaymentService): Router {
  const r = Router();
  r.post('/razorpay', express.raw({ type: 'application/json', limit: '256kb' }), async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const outcome = await payments.handleWebhook(raw, req.header('x-razorpay-signature'), req.header('x-razorpay-event-id'));
    // Duplicates and valid events answer 200 so Razorpay stops retrying.
    res.status(outcome === 'rejected' ? 400 : 200).json({ status: outcome });
  });
  return r;
}
