import { Router } from 'express';
import { businessRule } from '../../lib/errors';
import { z } from 'zod';
import {
  assignCommunityClusterSchema,
  createCitySchema,
  createClusterSchema,
  createCommunitySchema,
  createFlatSchema,
  createTowerSchema,
  paginationQuerySchema,
  updateCitySchema,
  updateClusterSchema,
  updateCommunitySchema,
  updateFlatSchema,
  updateTowerSchema,
  uuidSchema,
} from '@nestovin/contracts';
import type { AppDeps } from '../../http/context';
import { adminOf } from '../../http/context';
import { authorize, parseParam, parseQuery, validateBody } from '../../http/middleware';
import { LocationService } from './service';

const listQuery = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.string().max(20).optional(),
});
const communityListQuery = listQuery.extend({
  cityId: uuidSchema.optional(),
  clusterId: uuidSchema.optional(),
});

/** ADM-03 Location master data. Mounted under /v1/admin behind requireAdmin. */
export function locationRoutes(deps: AppDeps): Router {
  const r = Router();
  const svc = new LocationService(deps.db);
  const id = (v: unknown) => parseParam(uuidSchema, v);

  // Cities
  r.get('/cities', authorize('locations', 'view'), async (req, res) => {
    res.json(await svc.listCities(adminOf(req), parseQuery(listQuery, req)));
  });
  r.post('/cities', authorize('locations', 'create'), validateBody(createCitySchema), async (req, res) => {
    res.status(201).json(await svc.createCity(adminOf(req), req.requestId, req.body));
  });
  r.patch('/cities/:id', authorize('locations', 'edit'), validateBody(updateCitySchema), async (req, res) => {
    res.json(await svc.updateCity(adminOf(req), req.requestId, id(req.params.id), req.body));
  });

  // Clusters
  r.get('/clusters', authorize('locations', 'view'), async (req, res) => {
    res.json(await svc.listClusters(adminOf(req), parseQuery(listQuery, req)));
  });
  r.post('/clusters', authorize('locations', 'create'), validateBody(createClusterSchema), async (req, res) => {
    res.status(201).json(await svc.createCluster(adminOf(req), req.requestId, req.body));
  });
  r.patch('/clusters/:id', authorize('locations', 'edit'), validateBody(updateClusterSchema), async (req, res) => {
    res.json(await svc.updateCluster(adminOf(req), req.requestId, id(req.params.id), req.body));
  });

  // Communities
  r.get('/communities', authorize('locations', 'view'), async (req, res) => {
    res.json(await svc.listCommunities(adminOf(req), parseQuery(communityListQuery, req)));
  });
  r.get('/communities/:id', authorize('locations', 'view'), async (req, res) => {
    res.json(await svc.getCommunity(adminOf(req), id(req.params.id)));
  });
  r.post('/communities', authorize('locations', 'create'), validateBody(createCommunitySchema), async (req, res) => {
    res.status(201).json(await svc.createCommunity(adminOf(req), req.requestId, req.body));
  });
  r.patch('/communities/:id', authorize('locations', 'edit'), validateBody(updateCommunitySchema), async (req, res) => {
    res.json(await svc.updateCommunity(adminOf(req), req.requestId, id(req.params.id), req.body));
  });
  r.post(
    '/communities/:id/cluster',
    authorize('locations', 'edit'),
    validateBody(assignCommunityClusterSchema),
    async (req, res) => {
      res.json(await svc.assignCluster(adminOf(req), req.requestId, id(req.params.id), req.body));
    },
  );
  r.get('/communities/:id/cluster-history', authorize('locations', 'view'), async (req, res) => {
    res.json({ items: await svc.membershipHistory(adminOf(req), id(req.params.id)) });
  });

  // Towers
  r.get('/communities/:id/towers', authorize('locations', 'view'), async (req, res) => {
    res.json(await svc.listTowers(adminOf(req), id(req.params.id), parseQuery(listQuery, req)));
  });
  r.post('/towers', authorize('locations', 'create'), validateBody(createTowerSchema), async (req, res) => {
    res.status(201).json(await svc.createTower(adminOf(req), req.requestId, req.body));
  });
  r.patch('/towers/:id', authorize('locations', 'edit'), validateBody(updateTowerSchema), async (req, res) => {
    res.json(await svc.updateTower(adminOf(req), req.requestId, id(req.params.id), req.body));
  });

  // Flats
  r.get('/towers/:id/flats', authorize('locations', 'view'), async (req, res) => {
    res.json(await svc.listFlats(adminOf(req), id(req.params.id), parseQuery(listQuery, req)));
  });
  r.post('/flats', authorize('locations', 'create'), validateBody(createFlatSchema), async (req, res) => {
    res.status(201).json(await svc.createFlat(adminOf(req), req.requestId, req.body));
  });
  r.patch('/flats/:id', authorize('locations', 'edit'), validateBody(updateFlatSchema), async (req, res) => {
    res.json(await svc.updateFlat(adminOf(req), req.requestId, id(req.params.id), req.body));
  });

  // ADM-03A expansion votes (Super Admin only; enforced in the service)
  r.get('/expansion-votes', authorize('locations', 'view'), async (req, res) => {
    res.json({ items: await svc.voteAggregates(adminOf(req)) });
  });


  // Google Maps geocoding for community reference pins (key stays on the server).
  r.get('/geocode', authorize('locations', 'edit'), async (req, res) => {
    if (!deps.geocoder) throw businessRule('Map search is not configured. Enter the coordinates manually or add GOOGLE_MAPS_API_KEY.');
    const q = parseQuery(z.object({ address: z.string().trim().min(3).max(300) }), req);
    res.json({ items: await deps.geocoder.geocode(q.address) });
  });
  return r;
}
