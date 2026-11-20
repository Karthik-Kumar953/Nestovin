import { Router } from 'express';
import { z } from 'zod';
import {
  checkInSchema,
  completeVisitSchema,
  correctionRequestSchema,
  decideCorrectionSchema,
  feedbackSchema,
  geofenceSchema,
  residentAbsentSchema,
  reviewFlagSchema,
  uuidSchema,
  workerNoShowSchema,
} from '@nestovin/contracts';
import type { AppDeps } from '../../http/context';
import { adminOf, residentOf } from '../../http/context';
import { authorize, parseParam, parseQuery, rateLimit, validateBody } from '../../http/middleware';
import { employeeOf } from '../workforce/employee-service';
import { AttendanceService } from './service';

const id = (v: unknown) => parseParam(uuidSchema, v, 'id');
const isoDate = z.iso.date();
const shift = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const svcOf = (deps: AppDeps) => new AttendanceService(deps.db, deps.env.IP_HASH_SALT);

/** Inside /v1/resident (requireResident applied by the parent router). */
export function residentVisitRoutes(deps: AppDeps): Router {
  const r = Router();
  const svc = svcOf(deps);
  r.get('/visits', async (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const q = parseQuery(z.object({ from: isoDate.optional(), to: isoDate.optional() }), req);
    res.json({ items: await svc.residentVisits(residentOf(req), q.from ?? shift(today, -30), q.to ?? shift(today, 14)) });
  });
  r.post('/visits/:id/code', rateLimit(deps, { name: 'visit-code', limit: 30, windowSeconds: 3600, keyFn: (req) => req.resident?.id ?? null }), async (req, res) => {
    res.json(await svc.issueCode(residentOf(req), id(req.params.id)));
  });
  r.post('/visits/:id/feedback', validateBody(feedbackSchema), async (req, res) => {
    res.status(201).json(await svc.feedback(residentOf(req), req.requestId, id(req.params.id), req.body));
  });
  return r;
}

/** Inside /v1/employee (requireEmployee applied by the parent router). */
export function employeeVisitRoutes(deps: AppDeps): Router {
  const r = Router();
  const svc = svcOf(deps);
  r.post('/visits/:id/check-in', rateLimit(deps, { name: 'check-in', limit: 60, windowSeconds: 3600, keyFn: (req) => req.employee?.id ?? null }), validateBody(checkInSchema), async (req, res) => {
    res.json(await svc.checkIn(employeeOf(req), id(req.params.id), req.body));
  });
  r.post('/visits/:id/complete', validateBody(completeVisitSchema), async (req, res) => {
    res.json(await svc.complete(employeeOf(req), id(req.params.id), req.body.note));
  });
  r.post('/visits/:id/resident-absent', validateBody(residentAbsentSchema), async (req, res) => {
    res.json(await svc.residentAbsent(employeeOf(req), id(req.params.id), req.body));
  });
  r.post('/visits/:id/corrections', validateBody(correctionRequestSchema), async (req, res) => {
    res.status(201).json(await svc.requestCorrection(employeeOf(req), id(req.params.id), req.body));
  });
  return r;
}

/** ADM-12 / ADM-12A under /v1/admin. */
export function attendanceAdminRoutes(deps: AppDeps): Router {
  const r = Router();
  const svc = svcOf(deps);
  r.get('/attendance', authorize('attendance', 'view'), async (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const q = parseQuery(z.object({ communityId: uuidSchema.optional(), from: isoDate.optional(), to: isoDate.optional(), flagged: z.enum(['true', 'false']).default('false') }), req);
    res.json({ items: await svc.records(adminOf(req), { communityId: q.communityId, from: q.from ?? shift(today, -7), to: q.to ?? today, flaggedOnly: q.flagged === 'true' }) });
  });
  r.post('/attendance/events/:id/review', authorize('attendance', 'approve'), validateBody(reviewFlagSchema), async (req, res) => {
    res.json(await svc.reviewFlag(adminOf(req), req.requestId, id(req.params.id), req.body));
  });
  r.post('/visits/:id/worker-no-show', authorize('attendance', 'approve'), validateBody(workerNoShowSchema), async (req, res) => {
    res.json(await svc.workerNoShow(adminOf(req), req.requestId, id(req.params.id), req.body.note));
  });
  r.get('/attendance-corrections', authorize('attendance', 'view'), async (req, res) => {
    const q = parseQuery(z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING') }), req);
    res.json({ items: await svc.corrections(adminOf(req), q.status) });
  });
  r.post('/attendance-corrections/:id/decide', authorize('attendance', 'approve'), validateBody(decideCorrectionSchema), async (req, res) => {
    res.json(await svc.decideCorrection(adminOf(req), req.requestId, id(req.params.id), req.body));
  });
  r.put('/communities/:id/geofence', authorize('attendance', 'approve'), validateBody(geofenceSchema), async (req, res) => {
    res.json(await svc.setGeofence(adminOf(req), req.requestId, id(req.params.id), req.body.radiusM));
  });
  return r;
}
