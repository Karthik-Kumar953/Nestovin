import { Router } from 'express';
import { z } from 'zod';
import {
  approveFamilySchema,
  createTicketSchema,
  expansionVoteSchema,
  familyRequestSchema,
  paginationQuerySchema,
  registerResidenceSchema,
  rejectSchema,
  residentReplySchema,
  setResidentStatusSchema,
  updateResidentMeSchema,
  uuidSchema,
} from '@nestovin/contracts';
import type { AppDeps } from '../../http/context';
import { adminOf, residentOf } from '../../http/context';
import { authorize, parseParam, parseQuery, rateLimit, validateBody } from '../../http/middleware';
import { SupportService } from '../support/service';
import { requireResident } from './auth';
import { ResidentService } from './resident-service';
import { ResidentAdminService } from './admin-service';

const id = (v: unknown, name = 'id') => parseParam(uuidSchema, v, name);

/** /v1/resident/* — the Resident app (RES-01..05, RES-02A, RES-12, RES-14). */
export function residentRoutes(deps: AppDeps): Router {
  const r = Router();
  const svc = new ResidentService(deps.db, deps.storage);
  const support = new SupportService(deps.db);
  r.use(requireResident(deps));

  r.get('/me', async (req, res) => {
    res.json(await svc.me(residentOf(req)));
  });
  r.patch('/me', validateBody(updateResidentMeSchema), async (req, res) => {
    res.json(await svc.updateMe(residentOf(req), req.requestId, req.body));
  });

  // Location pickers (only active cities/communities are offered)
  r.get('/cities', async (req, res) => {
    res.json({ items: await svc.cities(residentOf(req)) });
  });
  r.get('/cities/:id/communities', async (req, res) => {
    res.json({ items: await svc.communities(residentOf(req), id(req.params.id)) });
  });
  r.get('/communities/:id/towers', async (req, res) => {
    res.json({ items: await svc.towers(residentOf(req), id(req.params.id)) });
  });
  r.get('/towers/:id/flats', async (req, res) => {
    res.json({ items: await svc.flats(residentOf(req), id(req.params.id)) });
  });

  r.post('/expansion-votes', validateBody(expansionVoteSchema), async (req, res) => {
    res.status(201).json(await svc.vote(residentOf(req), req.requestId, req.body));
  });

  // Residence registration + document upload (signed URL, then confirm)
  r.post(
    '/residence',
    rateLimit(deps, { name: 'residence', limit: 10, windowSeconds: 3600, keyFn: (req) => req.resident?.id ?? null }),
    validateBody(registerResidenceSchema),
    async (req, res) => {
      res.status(201).json(await svc.registerResidence(residentOf(req), req.requestId, req.body));
    },
  );
  r.post('/documents/:id/complete', async (req, res) => {
    res.json(await svc.completeDocument(residentOf(req), req.requestId, id(req.params.id)));
  });

  // Household & family
  r.get('/household', async (req, res) => {
    res.json(await svc.household(residentOf(req)));
  });
  r.post('/household/family-requests', validateBody(familyRequestSchema), async (req, res) => {
    res.status(201).json(await svc.requestFamily(residentOf(req), req.requestId, req.body));
  });
  r.delete('/household/family-requests/:id', async (req, res) => {
    res.json(await svc.cancelFamilyRequest(residentOf(req), req.requestId, id(req.params.id)));
  });
  r.delete('/household/members/:id', async (req, res) => {
    res.json(await svc.removeFamilyMember(residentOf(req), req.requestId, id(req.params.id)));
  });

  r.get('/catalogue', async (req, res) => {
    res.json(await svc.catalogue(residentOf(req)));
  });

  // Support
  r.get('/ticket-categories', async (_req, res) => {
    res.json({ items: (await support.categories(deps.db, true)).map(({ id: cid, name }) => ({ id: cid, name })) });
  });
  r.get('/tickets', async (req, res) => {
    res.json({ items: await support.residentList(residentOf(req)) });
  });
  r.post(
    '/tickets',
    rateLimit(deps, { name: 'ticket', limit: 20, windowSeconds: 3600, keyFn: (req) => req.resident?.id ?? null }),
    validateBody(createTicketSchema),
    async (req, res) => {
      res.status(201).json(await support.residentCreate(residentOf(req), req.requestId, req.body));
    },
  );
  r.get('/tickets/:id', async (req, res) => {
    res.json(await support.residentDetail(residentOf(req), id(req.params.id)));
  });
  r.post('/tickets/:id/replies', validateBody(residentReplySchema), async (req, res) => {
    res.status(201).json(await support.residentReply(residentOf(req), req.requestId, id(req.params.id), req.body.body));
  });

  return r;
}

const residentListQuery = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(60).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  communityId: uuidSchema.optional(),
});
const verificationQuery = z.object({
  decision: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const familyQuery = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).default('PENDING'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** ADM-05 residents + verification queue, ADM-06 family requests. Mounted under /v1/admin. */
export function residentAdminRoutes(deps: AppDeps): Router {
  const r = Router();
  const svc = new ResidentAdminService(deps.db, deps.storage);

  r.get('/residents', authorize('residents', 'view'), async (req, res) => {
    res.json(await svc.list(adminOf(req), parseQuery(residentListQuery, req)));
  });
  r.get('/residents/:id', authorize('residents', 'view'), async (req, res) => {
    res.json(await svc.detail(adminOf(req), id(req.params.id)));
  });
  r.patch('/residents/:id/status', authorize('residents', 'edit'), validateBody(setResidentStatusSchema), async (req, res) => {
    res.json(await svc.setStatus(adminOf(req), req.requestId, id(req.params.id), req.body));
  });

  r.get('/residence-verifications', authorize('residents', 'view'), async (req, res) => {
    res.json({ items: await svc.verifications(adminOf(req), parseQuery(verificationQuery, req)) });
  });
  r.post('/residence-verifications/:id/approve', authorize('residents', 'approve'), async (req, res) => {
    res.json(await svc.approveVerification(adminOf(req), req.requestId, id(req.params.id)));
  });
  r.post('/residence-verifications/:id/reject', authorize('residents', 'approve'), validateBody(rejectSchema), async (req, res) => {
    res.json(await svc.rejectVerification(adminOf(req), req.requestId, id(req.params.id), req.body.reason));
  });
  r.post('/documents/:id/url', authorize('residents', 'view'), async (req, res) => {
    res.json(await svc.documentUrl(adminOf(req), req.requestId, id(req.params.id)));
  });

  r.get('/family-requests', authorize('family_requests', 'view'), async (req, res) => {
    res.json({ items: await svc.familyRequests(adminOf(req), parseQuery(familyQuery, req)) });
  });
  r.post('/family-requests/:id/approve', authorize('family_requests', 'approve'), validateBody(approveFamilySchema), async (req, res) => {
    res.json(await svc.approveFamily(adminOf(req), req.requestId, id(req.params.id), req.body));
  });
  r.post('/family-requests/:id/reject', authorize('family_requests', 'approve'), validateBody(rejectSchema), async (req, res) => {
    res.json(await svc.rejectFamily(adminOf(req), req.requestId, id(req.params.id), req.body.reason));
  });

  return r;
}
