import express, { Router } from 'express';
import { z } from 'zod';
import { IMPORT_LIMITS, XLSX_MIME, importDecisionSchema, uuidSchema } from '@nestovin/contracts';
import type { AppDeps } from '../../http/context';
import { adminOf } from '../../http/context';
import { authorize, parseParam, parseQuery, validateBody } from '../../http/middleware';
import { AppError } from '../../lib/errors';
import { MigrationService } from './service';

const rowsQuery = z.object({
  onlyProblems: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  afterRow: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/** ADM-04 community migration + activation. Mounted under /v1/admin behind requireAdmin. */
export function migrationRoutes(deps: AppDeps): Router {
  const r = Router();
  const svc = new MigrationService(deps.db);
  const id = (v: unknown) => parseParam(uuidSchema, v);

  r.get('/communities/:id/import-template', authorize('community_migration', 'view'), async (req, res) => {
    const { fileName, buffer } = await svc.template(adminOf(req), id(req.params.id));
    res.setHeader('Content-Type', XLSX_MIME);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  });

  // Raw .xlsx body (max 5 MB). The original file name is sent URL-encoded in X-File-Name.
  r.post(
    '/communities/:id/import-batches',
    authorize('community_migration', 'create'),
    express.raw({ type: XLSX_MIME, limit: IMPORT_LIMITS.maxBytes }),
    async (req, res) => {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        throw new AppError('VALIDATION_FAILED', 'Upload an .xlsx file (Content-Type must be the Excel workbook type)');
      }
      let fileName = 'upload.xlsx';
      try {
        fileName = decodeURIComponent(req.header('x-file-name') ?? fileName).replace(/[\r\n"]/g, '').slice(0, 255);
      } catch {
        // keep default
      }
      res.status(201).json(await svc.upload(adminOf(req), req.requestId, id(req.params.id), fileName, req.body));
    },
  );

  r.get('/communities/:id/import-batches', authorize('community_migration', 'view'), async (req, res) => {
    res.json({ items: await svc.listBatches(adminOf(req), id(req.params.id)) });
  });
  r.get('/import-batches/:id', authorize('community_migration', 'view'), async (req, res) => {
    res.json(await svc.getBatch(adminOf(req), id(req.params.id)));
  });
  r.get('/import-batches/:id/rows', authorize('community_migration', 'view'), async (req, res) => {
    res.json(await svc.rows(adminOf(req), id(req.params.id), parseQuery(rowsQuery, req)));
  });
  r.post('/import-batches/:id/approve', authorize('community_migration', 'approve'), validateBody(importDecisionSchema), async (req, res) => {
    res.json(await svc.approve(adminOf(req), req.requestId, id(req.params.id), req.body.reason));
  });
  r.post('/import-batches/:id/reject', authorize('community_migration', 'approve'), validateBody(importDecisionSchema), async (req, res) => {
    res.json(await svc.reject(adminOf(req), req.requestId, id(req.params.id), req.body.reason));
  });
  r.post('/import-batches/:id/cancel', authorize('community_migration', 'create'), validateBody(importDecisionSchema), async (req, res) => {
    res.json(await svc.cancel(adminOf(req), req.requestId, id(req.params.id), req.body.reason));
  });
  r.post('/import-batches/:id/commit', authorize('community_migration', 'publish'), async (req, res) => {
    res.json(await svc.commit(adminOf(req), req.requestId, id(req.params.id)));
  });

  // Activation
  r.get('/communities/:id/activation', authorize('community_migration', 'view'), async (req, res) => {
    res.json(await svc.checklist(adminOf(req), id(req.params.id)));
  });
  r.post('/communities/:id/activate', authorize('community_migration', 'publish'), async (req, res) => {
    res.json(await svc.activate(adminOf(req), req.requestId, id(req.params.id)));
  });

  return r;
}
