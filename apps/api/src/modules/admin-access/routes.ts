import { Router } from 'express';
import { z } from 'zod';
import {
  MODULES,
  MODULE_KEYS,
  createAdminUserSchema,
  createRoleSchema,
  paginationQuerySchema,
  setAdminStatusSchema,
  updateAdminUserSchema,
  updateRoleSchema,
  uuidSchema,
} from '@nestovin/contracts';
import type { AppDeps } from '../../http/context';
import { adminOf } from '../../http/context';
import { authorize, parseParam, parseQuery, validateBody } from '../../http/middleware';
import { effectiveGrantList, hasAnyAccess } from '../../auth/permissions';
import { AdminAccessService } from './service';

/** ADM-02 (Super Admin only) plus the current-session endpoint used by every admin. */
export function adminAccessRoutes(deps: AppDeps): Router {
  const r = Router();
  const svc = new AdminAccessService(deps.db, deps.authAdmin, deps.logger, `${deps.env.ADMIN_PORTAL_URL}/accept-invite`);
  const id = (v: unknown) => parseParam(uuidSchema, v);

  // Current admin: identity, effective grants (for navigation) and scope.
  r.get('/me', (req, res) => {
    const actor = adminOf(req);
    res.json({
      id: actor.id,
      email: actor.email,
      fullName: actor.fullName,
      isSuperAdmin: actor.isSuperAdmin,
      hasAnyAccess: hasAnyAccess(actor),
      grants: effectiveGrantList(actor),
      scope: actor.scope,
    });
  });

  // The permission catalogue, for the role editor.
  r.get('/permission-catalogue', authorize('admin_access', 'view'), (_req, res) => {
    res.json({
      modules: MODULE_KEYS.map((key) => ({
        key,
        ref: MODULES[key].ref,
        label: MODULES[key].label,
        actions: MODULES[key].actions,
        grantable: MODULES[key].grantable,
      })),
    });
  });

  // Roles
  r.get('/roles', authorize('admin_access', 'view'), async (_req, res) => {
    res.json({ items: await svc.listRoles() });
  });
  r.get('/roles/:id', authorize('admin_access', 'view'), async (req, res) => {
    res.json(await svc.getRole(id(req.params.id)));
  });
  r.post('/roles', authorize('admin_access', 'create'), validateBody(createRoleSchema), async (req, res) => {
    res.status(201).json(await svc.createRole(adminOf(req), req.requestId, req.body));
  });
  r.patch('/roles/:id', authorize('admin_access', 'edit'), validateBody(updateRoleSchema), async (req, res) => {
    res.json(await svc.updateRole(adminOf(req), req.requestId, id(req.params.id), req.body));
  });
  r.delete('/roles/:id', authorize('admin_access', 'delete'), async (req, res) => {
    await svc.deleteRole(adminOf(req), req.requestId, id(req.params.id));
    res.status(204).end();
  });

  // Admin users
  const adminListQuery = paginationQuerySchema.extend({
    q: z.string().trim().max(100).optional(),
    status: z.enum(['INVITED', 'ACTIVE', 'DISABLED']).optional(),
  });
  r.get('/admins', authorize('admin_access', 'view'), async (req, res) => {
    res.json(await svc.listAdmins(parseQuery(adminListQuery, req)));
  });
  r.get('/admins/:id', authorize('admin_access', 'view'), async (req, res) => {
    res.json(await svc.getAdmin(id(req.params.id)));
  });
  r.post('/admins', authorize('admin_access', 'create'), validateBody(createAdminUserSchema), async (req, res) => {
    res.status(201).json(await svc.createAdmin(adminOf(req), req.requestId, req.body));
  });
  r.patch('/admins/:id', authorize('admin_access', 'edit'), validateBody(updateAdminUserSchema), async (req, res) => {
    res.json(await svc.updateAdmin(adminOf(req), req.requestId, id(req.params.id), req.body));
  });
  r.post('/admins/:id/status', authorize('admin_access', 'edit'), validateBody(setAdminStatusSchema), async (req, res) => {
    res.json(await svc.setStatus(adminOf(req), req.requestId, id(req.params.id), req.body));
  });

  return r;
}
