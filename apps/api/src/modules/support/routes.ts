import { Router } from 'express';
import { z } from 'zod';
import {
  adminTicketUpdateSchema,
  enquiryStatusSchema,
  paginationQuerySchema,
  patchEnquirySchema,
  patchTicketSchema,
  ticketStatusSchema,
  upsertTicketCategorySchema,
  uuidSchema,
} from '@nestovin/contracts';
import type { AppDeps } from '../../http/context';
import { adminOf } from '../../http/context';
import { authorize, parseParam, parseQuery, validateBody } from '../../http/middleware';
import { SupportService } from './service';

const id = (v: unknown, name = 'id') => parseParam(uuidSchema, v, name);
const flag = z.enum(['true', 'false']).transform((v) => v === 'true').optional();

const ticketQuery = paginationQuerySchema.extend({
  status: ticketStatusSchema.optional(),
  categoryId: uuidSchema.optional(),
  mine: flag,
  open: flag,
});
const enquiryQuery = paginationQuerySchema.extend({ status: enquiryStatusSchema.optional() });

/** ADM-13 support tickets, categories and website enquiries. Mounted under /v1/admin. */
export function supportAdminRoutes(deps: AppDeps): Router {
  const r = Router();
  const svc = new SupportService(deps.db);

  r.get('/ticket-categories', authorize('support', 'view'), async (_req, res) => {
    res.json({ items: await svc.categories(deps.db, false) });
  });
  r.post('/ticket-categories', authorize('support', 'edit'), validateBody(upsertTicketCategorySchema), async (req, res) => {
    res.status(201).json({ items: await svc.upsertCategory(adminOf(req), req.requestId, null, req.body) });
  });
  r.patch('/ticket-categories/:id', authorize('support', 'edit'), validateBody(upsertTicketCategorySchema), async (req, res) => {
    res.json({ items: await svc.upsertCategory(adminOf(req), req.requestId, id(req.params.id), req.body) });
  });

  r.get('/tickets', authorize('support', 'view'), async (req, res) => {
    const q = parseQuery(ticketQuery, req);
    res.json(await svc.adminList(adminOf(req), { ...q, mine: q.mine ?? false, open: q.open ?? false }));
  });
  r.get('/tickets/:id', authorize('support', 'view'), async (req, res) => {
    res.json(await svc.adminDetail(adminOf(req), id(req.params.id)));
  });
  r.patch('/tickets/:id', authorize('support', 'edit'), validateBody(patchTicketSchema), async (req, res) => {
    res.json(await svc.adminPatch(adminOf(req), req.requestId, id(req.params.id), req.body));
  });
  r.post('/tickets/:id/updates', authorize('support', 'edit'), validateBody(adminTicketUpdateSchema), async (req, res) => {
    res.status(201).json(await svc.adminAddUpdate(adminOf(req), req.requestId, id(req.params.id), req.body));
  });

  r.get('/enquiries', authorize('support', 'view'), async (req, res) => {
    res.json(await svc.enquiries(adminOf(req), parseQuery(enquiryQuery, req)));
  });
  r.patch('/enquiries/:id', authorize('support', 'edit'), validateBody(patchEnquirySchema), async (req, res) => {
    res.json(await svc.setEnquiryStatus(adminOf(req), req.requestId, id(req.params.id), req.body.status));
  });

  return r;
}
