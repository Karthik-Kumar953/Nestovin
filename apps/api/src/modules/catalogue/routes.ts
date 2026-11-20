import { Router } from 'express';
import {
  createDraftSchema,
  createResidenceCategorySchema,
  createServiceTaskSchema,
  createTimeWindowSchema,
  publishCatalogueSchema,
  putPriceMatrixSchema,
  updateCommunityServicesSchema,
  updateResidenceCategorySchema,
  updateServiceTaskSchema,
  updateTimeWindowSchema,
  upsertComponentSchema,
  upsertPlanSchema,
  uuidSchema,
} from '@nestovin/contracts';
import type { AppDeps } from '../../http/context';
import { adminOf } from '../../http/context';
import { authorize, parseParam, validateBody } from '../../http/middleware';
import { CatalogueService } from './service';

/** ADM-07 per-community catalogue & pricing. Mounted under /v1/admin behind requireAdmin. */
export function catalogueRoutes(deps: AppDeps): Router {
  const r = Router();
  const svc = new CatalogueService(deps.db);
  const id = (v: unknown, name = 'id') => parseParam(uuidSchema, v, name);

  // Services & operating modes
  r.get('/communities/:id/services', authorize('catalogue_pricing', 'view'), async (req, res) => {
    res.json(await svc.getServices(adminOf(req), id(req.params.id)));
  });
  r.put('/communities/:id/services', authorize('catalogue_pricing', 'edit'), validateBody(updateCommunityServicesSchema), async (req, res) => {
    res.json(await svc.putServices(adminOf(req), req.requestId, id(req.params.id), req.body));
  });

  // Residence categories
  r.get('/communities/:id/residence-categories', authorize('catalogue_pricing', 'view'), async (req, res) => {
    res.json({ items: await svc.listCategories(adminOf(req), id(req.params.id)) });
  });
  r.post('/communities/:id/residence-categories', authorize('catalogue_pricing', 'create'), validateBody(createResidenceCategorySchema), async (req, res) => {
    const communityId = id(req.params.id);
    await svc.createCategory(adminOf(req), req.requestId, communityId, req.body);
    res.status(201).json({ items: await svc.listCategories(adminOf(req), communityId) });
  });
  r.patch(
    '/communities/:id/residence-categories/:categoryId',
    authorize('catalogue_pricing', 'edit'),
    validateBody(updateResidenceCategorySchema),
    async (req, res) => {
      const communityId = id(req.params.id);
      await svc.updateCategory(adminOf(req), req.requestId, communityId, id(req.params.categoryId, 'categoryId'), req.body);
      res.json({ items: await svc.listCategories(adminOf(req), communityId) });
    },
  );

  // Time windows
  r.get('/communities/:id/time-windows', authorize('catalogue_pricing', 'view'), async (req, res) => {
    res.json({ items: await svc.listWindows(adminOf(req), id(req.params.id)) });
  });
  r.post('/communities/:id/time-windows', authorize('catalogue_pricing', 'create'), validateBody(createTimeWindowSchema), async (req, res) => {
    const communityId = id(req.params.id);
    await svc.createWindow(adminOf(req), req.requestId, communityId, req.body);
    res.status(201).json({ items: await svc.listWindows(adminOf(req), communityId) });
  });
  r.patch('/communities/:id/time-windows/:windowId', authorize('catalogue_pricing', 'edit'), validateBody(updateTimeWindowSchema), async (req, res) => {
    const communityId = id(req.params.id);
    await svc.updateWindow(adminOf(req), req.requestId, communityId, id(req.params.windowId, 'windowId'), req.body);
    res.json({ items: await svc.listWindows(adminOf(req), communityId) });
  });

  // Tasks
  r.get('/communities/:id/tasks', authorize('catalogue_pricing', 'view'), async (req, res) => {
    res.json({ items: await svc.listTasks(adminOf(req), id(req.params.id)) });
  });
  r.post('/communities/:id/tasks', authorize('catalogue_pricing', 'create'), validateBody(createServiceTaskSchema), async (req, res) => {
    const communityId = id(req.params.id);
    await svc.createTask(adminOf(req), req.requestId, communityId, req.body);
    res.status(201).json({ items: await svc.listTasks(adminOf(req), communityId) });
  });
  r.patch('/communities/:id/tasks/:taskId', authorize('catalogue_pricing', 'edit'), validateBody(updateServiceTaskSchema), async (req, res) => {
    const communityId = id(req.params.id);
    await svc.updateTask(adminOf(req), req.requestId, communityId, id(req.params.taskId, 'taskId'), req.body);
    res.json({ items: await svc.listTasks(adminOf(req), communityId) });
  });

  // Catalogue versions
  r.get('/communities/:id/catalogue-versions', authorize('catalogue_pricing', 'view'), async (req, res) => {
    res.json({ items: await svc.listVersions(adminOf(req), id(req.params.id)) });
  });
  r.post('/communities/:id/catalogue-versions', authorize('catalogue_pricing', 'create'), validateBody(createDraftSchema), async (req, res) => {
    res.status(201).json(await svc.createDraft(adminOf(req), req.requestId, id(req.params.id), req.body));
  });
  r.get('/catalogue-versions/:id', authorize('catalogue_pricing', 'view'), async (req, res) => {
    res.json(await svc.getVersion(adminOf(req), id(req.params.id)));
  });
  r.delete('/catalogue-versions/:id', authorize('catalogue_pricing', 'delete'), async (req, res) => {
    await svc.discardDraft(adminOf(req), req.requestId, id(req.params.id));
    res.status(204).end();
  });
  r.get('/catalogue-versions/:id/validation', authorize('catalogue_pricing', 'view'), async (req, res) => {
    res.json(await svc.validate(adminOf(req), id(req.params.id)));
  });
  r.post('/catalogue-versions/:id/publish', authorize('catalogue_pricing', 'publish'), validateBody(publishCatalogueSchema), async (req, res) => {
    res.json(await svc.publish(adminOf(req), req.requestId, id(req.params.id), req.body));
  });
  r.put('/catalogue-versions/:id/price-matrix', authorize('catalogue_pricing', 'edit'), validateBody(putPriceMatrixSchema), async (req, res) => {
    res.json(await svc.putPriceMatrix(adminOf(req), req.requestId, id(req.params.id), req.body));
  });

  // Plans & components (draft only)
  r.post('/catalogue-versions/:id/plans', authorize('catalogue_pricing', 'create'), validateBody(upsertPlanSchema), async (req, res) => {
    res.status(201).json(await svc.createPlan(adminOf(req), req.requestId, id(req.params.id), req.body));
  });
  r.put('/plans/:id', authorize('catalogue_pricing', 'edit'), validateBody(upsertPlanSchema), async (req, res) => {
    res.json(await svc.updatePlan(adminOf(req), req.requestId, id(req.params.id), req.body));
  });
  r.delete('/plans/:id', authorize('catalogue_pricing', 'delete'), async (req, res) => {
    res.json(await svc.deletePlan(adminOf(req), req.requestId, id(req.params.id)));
  });
  r.post('/plans/:id/components', authorize('catalogue_pricing', 'edit'), validateBody(upsertComponentSchema), async (req, res) => {
    res.status(201).json(await svc.createComponent(adminOf(req), req.requestId, id(req.params.id), req.body));
  });
  r.put('/plan-components/:id', authorize('catalogue_pricing', 'edit'), validateBody(upsertComponentSchema), async (req, res) => {
    res.json(await svc.updateComponent(adminOf(req), req.requestId, id(req.params.id), req.body));
  });
  r.delete('/plan-components/:id', authorize('catalogue_pricing', 'edit'), async (req, res) => {
    res.json(await svc.deleteComponent(adminOf(req), req.requestId, id(req.params.id)));
  });

  return r;
}
