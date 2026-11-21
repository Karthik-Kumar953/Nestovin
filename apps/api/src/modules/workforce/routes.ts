import { Router } from 'express';
import { z } from 'zod';
import {
  availabilitySchema,
  confirmStandingSchema,
  convertApplicantSchema,
  createApplicantSchema,
  createEmployeeSchema,
  createLeaveSchema,
  decideLeaveSchema,
  paginationQuerySchema,
  replaceOccurrenceSchema,
  reviewApplicantSchema,
  setQualificationsSchema,
  setReadinessSchema,
  setVerificationSchema,
  updateEmployeeSchema,
  upsertTrainingItemSchema,
  upsertVerificationItemSchema,
  uuidSchema,
} from '@nestovin/contracts';
import type { AppDeps } from '../../http/context';
import { adminOf } from '../../http/context';
import { authorize, hashIp, parseParam, parseQuery, rateLimit, validateBody, type Handler } from '../../http/middleware';
import { forbidden } from '../../lib/errors';
import { AllocationService } from './allocation';
import { OvertimeService, confirmOfferSchema, createOfferSchema, respondOfferSchema } from './overtime';
import { WorkforceAdminService } from './admin-service';
import { EmployeeService, employeeOf, requireEmployee } from './employee-service';
import { businessToday } from '../../lib/dates';

const id = (v: unknown, name = 'id') => parseParam(uuidSchema, v, name);
const isoDate = z.iso.date();
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

/** EMP-01 public applicant intake (no login is created). */
export function publicApplicantRoutes(deps: AppDeps): Router {
  const r = Router();
  const svc = new WorkforceAdminService(deps.db, deps.authAdmin);
  r.post(
    '/applicants',
    rateLimit(deps, { name: 'applicant', limit: 5, windowSeconds: 3600, keyFn: (req) => hashIp(req.ip, deps.env.IP_HASH_SALT) }),
    validateBody(createApplicantSchema),
    async (req, res) => {
      if (req.body.website) {
        res.status(202).json({ received: true });
        return;
      }
      res.status(202).json(await svc.submitApplicant(req.body, req.requestId));
    },
  );
  return r;
}

/** /v1/employee/* — the Worker app. */
export function employeeRoutes(deps: AppDeps, ...extra: Router[]): Router {
  const r = Router();
  const svc = new EmployeeService(deps.db);
  r.use(requireEmployee(deps));
  r.get('/me', async (req, res) => {
    res.json(await svc.me(employeeOf(req)));
  });
  r.post('/me/password-changed', async (req, res) => {
    res.json(await svc.passwordChanged(employeeOf(req)));
  });
  r.get('/schedule', async (req, res) => {
    const today = businessToday();
    const q = parseQuery(z.object({ from: isoDate.optional(), to: isoDate.optional() }), req);
    res.json({ items: await svc.schedule(employeeOf(req), q.from ?? today, q.to ?? addDays(q.from ?? today, 14)) });
  });
  r.get('/visits/:id', async (req, res) => {
    res.json(await svc.visit(employeeOf(req), id(req.params.id)));
  });
  r.get('/leave', async (req, res) => {
    res.json({ items: await svc.leave(employeeOf(req)) });
  });
  r.post('/leave', validateBody(createLeaveSchema), async (req, res) => {
    res.status(201).json({ items: await svc.requestLeave(employeeOf(req), req.body) });
  });
  r.post('/leave/:id/cancel', async (req, res) => {
    res.json({ items: await svc.cancelLeave(employeeOf(req), id(req.params.id)) });
  });
  // EMP-08 overtime offers
  const overtime = new OvertimeService(deps.db);
  r.get('/overtime-offers', async (req, res) => {
    res.json({ items: await overtime.mine(employeeOf(req)) });
  });
  r.post('/overtime-offers/:id/respond', validateBody(respondOfferSchema), async (req, res) => {
    res.json({ items: await overtime.respond(employeeOf(req), id(req.params.id), req.body.response) });
  });
  r.post('/training/:id/complete', async (req, res) => {
    res.json(await svc.completeTraining(employeeOf(req), id(req.params.id)));
  });
  for (const x of extra) r.use(x);
  return r;
}

const employeeQuery = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(60).optional(),
  readiness: z.enum(['READY', 'NOT_READY']).optional(),
  clusterId: uuidSchema.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'EXITED']).optional(),
});

/** ADM-09 / ADM-11 under /v1/admin. */
export function workforceAdminRoutes(deps: AppDeps): Router {
  const r = Router();
  const svc = new WorkforceAdminService(deps.db, deps.authAdmin);
  const alloc = new AllocationService(deps.db, deps.logger);

  const anyView: Handler = (req, _res, next) => {
    const a = adminOf(req);
    if (a.isSuperAdmin || a.grants.has('employees:view') || a.grants.has('allocation:view')) return next();
    throw forbidden();
  };
  r.get('/service-options', anyView, async (req, res) => {
    res.json({ items: await svc.serviceOptions(adminOf(req)) });
  });
  r.get('/cluster-options', anyView, async (req, res) => {
    res.json({ items: await svc.clusterOptions(adminOf(req)) });
  });

  // Applicants
  r.get('/applicants', authorize('employees', 'view'), async (req, res) => {
    const q = parseQuery(z.object({ status: z.enum(['NEW', 'IN_REVIEW', 'REJECTED', 'CONVERTED']).optional() }), req);
    res.json({ items: await svc.applicants(adminOf(req), q.status) });
  });
  r.patch('/applicants/:id', authorize('employees', 'edit'), validateBody(reviewApplicantSchema), async (req, res) => {
    res.json(await svc.reviewApplicant(adminOf(req), req.requestId, id(req.params.id), req.body));
  });
  r.post('/applicants/:id/convert', authorize('employees', 'create'), validateBody(convertApplicantSchema), async (req, res) => {
    res.status(201).json(await svc.convertApplicant(adminOf(req), req.requestId, id(req.params.id), req.body));
  });

  // Employees
  r.get('/employees', authorize('employees', 'view'), async (req, res) => {
    res.json(await svc.listEmployees(adminOf(req), parseQuery(employeeQuery, req)));
  });
  r.post('/employees', authorize('employees', 'create'), validateBody(createEmployeeSchema), async (req, res) => {
    res.status(201).json(await svc.createEmployee(adminOf(req), req.requestId, req.body));
  });
  r.get('/employees/:id', authorize('employees', 'view'), async (req, res) => {
    res.json(await svc.detail(adminOf(req), id(req.params.id)));
  });
  r.patch('/employees/:id', authorize('employees', 'edit'), validateBody(updateEmployeeSchema), async (req, res) => {
    res.json(await svc.updateEmployee(adminOf(req), req.requestId, id(req.params.id), req.body));
  });
  r.put('/employees/:id/verifications/:itemId', authorize('employees', 'approve'), validateBody(setVerificationSchema), async (req, res) => {
    res.json(await svc.setVerification(adminOf(req), req.requestId, id(req.params.id), id(req.params.itemId, 'itemId'), req.body));
  });
  r.put('/employees/:id/qualifications', authorize('employees', 'approve'), validateBody(setQualificationsSchema), async (req, res) => {
    res.json(await svc.setQualifications(adminOf(req), req.requestId, id(req.params.id), req.body.serviceIds));
  });
  r.put('/employees/:id/readiness', authorize('employees', 'approve'), validateBody(setReadinessSchema), async (req, res) => {
    res.json(await svc.setReadiness(adminOf(req), req.requestId, id(req.params.id), req.body));
  });
  r.put('/employees/:id/availability', authorize('employees', 'edit'), validateBody(availabilitySchema), async (req, res) => {
    res.json(await svc.setAvailability(adminOf(req), req.requestId, id(req.params.id), req.body));
  });
  r.post('/employees/:id/login', authorize('employees', 'approve'), async (req, res) => {
    res.json(await svc.enableLogin(adminOf(req), req.requestId, id(req.params.id)));
  });

  // Checklist and training configuration
  r.get('/verification-items', authorize('employees', 'view'), async (req, res) => {
    res.json({ items: await svc.verificationItems(adminOf(req)) });
  });
  r.post('/verification-items', authorize('employees', 'edit'), validateBody(upsertVerificationItemSchema), async (req, res) => {
    res.status(201).json({ items: await svc.upsertVerificationItem(adminOf(req), req.requestId, null, req.body) });
  });
  r.patch('/verification-items/:id', authorize('employees', 'edit'), validateBody(upsertVerificationItemSchema), async (req, res) => {
    res.json({ items: await svc.upsertVerificationItem(adminOf(req), req.requestId, id(req.params.id), req.body) });
  });
  r.get('/training-items', authorize('employees', 'view'), async (req, res) => {
    res.json({ items: await svc.trainingItems(adminOf(req)) });
  });
  r.post('/training-items', authorize('employees', 'edit'), validateBody(upsertTrainingItemSchema), async (req, res) => {
    res.status(201).json({ items: await svc.upsertTrainingItem(adminOf(req), req.requestId, null, req.body) });
  });
  r.patch('/training-items/:id', authorize('employees', 'edit'), validateBody(upsertTrainingItemSchema), async (req, res) => {
    res.json({ items: await svc.upsertTrainingItem(adminOf(req), req.requestId, id(req.params.id), req.body) });
  });

  // Leave
  r.get('/leave-requests', authorize('employees', 'view'), async (req, res) => {
    const q = parseQuery(z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).default('PENDING') }), req);
    res.json({ items: await svc.leaveRequests(adminOf(req), q.status) });
  });
  r.post('/leave-requests/:id/decide', authorize('employees', 'approve'), validateBody(decideLeaveSchema), async (req, res) => {
    res.json(await svc.decideLeave(adminOf(req), req.requestId, id(req.params.id), req.body));
  });

  // Allocation (ADM-11)
  r.get('/allocation/needs', authorize('allocation', 'view'), async (req, res) => {
    const q = parseQuery(z.object({ communityId: uuidSchema.optional(), unassigned: z.enum(['true', 'false']).default('false') }), req);
    res.json({ items: await alloc.needs(adminOf(req), { communityId: q.communityId, unassignedOnly: q.unassigned === 'true' }) });
  });
  r.get('/allocation/components/:id/candidates', authorize('allocation', 'view'), async (req, res) => {
    res.json(await alloc.candidates(adminOf(req), id(req.params.id)));
  });
  r.post('/allocation/components/:id/standing', authorize('allocation', 'approve'), validateBody(confirmStandingSchema), async (req, res) => {
    res.json(await alloc.confirmStanding(adminOf(req), req.requestId, id(req.params.id), req.body));
  });
  r.get('/visits', authorize('allocation', 'view'), async (req, res) => {
    const today = businessToday();
    const q = parseQuery(
      z.object({ communityId: uuidSchema.optional(), from: isoDate.optional(), to: isoDate.optional(), unassigned: z.enum(['true', 'false']).default('false') }),
      req,
    );
    const from = q.from ?? today;
    res.json({ items: await alloc.occurrences(adminOf(req), { communityId: q.communityId, from, to: q.to ?? addDays(from, 7), unassignedOnly: q.unassigned === 'true' }) });
  });
  r.get('/visits/:id/candidates', authorize('allocation', 'view'), async (req, res) => {
    res.json(await alloc.occurrenceCandidates(adminOf(req), id(req.params.id)));
  });
  // EMP-08 overtime: offer -> worker accepts/rejects -> admin confirms
  const overtime = new OvertimeService(deps.db);
  r.get('/visits/:id/overtime-candidates', authorize('allocation', 'view'), async (req, res) => {
    res.json(await overtime.candidates(adminOf(req), id(req.params.id)));
  });
  r.post('/visits/:id/overtime-offers', authorize('allocation', 'create'), validateBody(createOfferSchema), async (req, res) => {
    res.status(201).json(await overtime.offer(adminOf(req), req.requestId, id(req.params.id), req.body));
  });
  r.get('/overtime-offers', authorize('allocation', 'view'), async (req, res) => {
    const q = parseQuery(z.object({ status: z.enum(['OPEN', 'FILLED', 'CANCELLED']).default('OPEN') }), req);
    res.json({ items: await overtime.list(adminOf(req), q.status) });
  });
  r.post('/overtime-offers/:id/confirm', authorize('allocation', 'approve'), validateBody(confirmOfferSchema), async (req, res) => {
    res.json(await overtime.confirm(adminOf(req), req.requestId, id(req.params.id), req.body.employeeId));
  });
  r.post('/overtime-offers/:id/cancel', authorize('allocation', 'edit'), async (req, res) => {
    res.json(await overtime.cancel(adminOf(req), req.requestId, id(req.params.id)));
  });

  r.post('/visits/:id/assign', authorize('allocation', 'edit'), validateBody(replaceOccurrenceSchema), async (req, res) => {
    res.json(await alloc.assignOccurrence(adminOf(req), req.requestId, id(req.params.id), req.body));
  });

  return r;
}
