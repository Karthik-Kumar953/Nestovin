import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Router } from 'express';
import { MODULES, allCatalogueGrants, grantKey, isGrantable, type GrantKey, type ModuleKey } from '@nestovin/contracts';
import { createApp } from '../../src/app';
import { actor, fakeDeps } from '../helpers/fake-deps';

/*
 * Route authorisation matrix (QA). Every route is discovered from the module
 * route files, so a new route is covered automatically and a new route WITHOUT
 * a guard fails this suite until it is added to the reviewed allowlist below.
 *
 * Unit layer (no database; the fake DB throws if reached):
 *   - 401 without a token, for every admin, resident and employee route
 *   - 403 for an admin with no grants
 *   - 403 for an admin holding every grant except the route's own module:action
 *   - authZ passes (anything but 401/403) for an admin holding only that grant,
 *     and for the Super Admin
 * The 404-out-of-scope / 200-in-scope half lives in
 * test/integration/route-scope-matrix.test.ts (needs real data).
 */

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
interface RouteDef {
  fn: string;
  method: Method;
  path: string;
  /** authorize(module, action) declared as the first middleware, if any. */
  guard: { module: ModuleKey; action: string } | null;
}

const MODULES_DIR = resolve(import.meta.dirname, '../../src/modules');

function discoverRoutes(): RouteDef[] {
  const out: RouteDef[] = [];
  for (const mod of readdirSync(MODULES_DIR)) {
    const file = join(MODULES_DIR, mod, 'routes.ts');
    if (!existsSync(file)) continue;
    const src = readFileSync(file, 'utf8');
    for (const part of src.split(/(?=export function )/)) {
      const fn = /^export function (\w+)/.exec(part)?.[1];
      if (!fn) continue;
      const re = /\br\.(get|post|put|patch|delete)\(\s*'([^']+)'\s*,(?=([\s\S]{0,200}))/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(part))) {
        const g = /^\s*authorize\('(\w+)',\s*'(\w+)'\)/.exec(m[3]!);
        out.push({ fn, method: m[1] as Method, path: m[2]!, guard: g ? { module: g[1] as ModuleKey, action: g[2]! } : null });
      }
    }
  }
  return out;
}

const ADMIN_FNS = new Set([
  'adminAccessRoutes',
  'locationRoutes',
  'catalogueRoutes',
  'migrationRoutes',
  'residentAdminRoutes',
  'supportAdminRoutes',
  'bookingAdminRoutes',
  'workforceAdminRoutes',
  'attendanceAdminRoutes',
  'overviewRoutes',
  'auditRoutes',
  'exportRoutes',
  'notificationAdminRoutes',
  'payrollAdminRoutes',
]);
const RESIDENT_FNS = new Set(['residentRoutes', 'residentBookingRoutes', 'residentVisitRoutes']);
const EMPLOYEE_FNS = new Set(['employeeRoutes', 'employeeVisitRoutes', 'employeePayslipRoutes']);
const UNAUTHENTICATED_FNS = new Set(['publicEnquiryRoutes', 'publicApplicantRoutes', 'razorpayWebhookRoutes', 'supabaseHookRoutes']);

/**
 * Admin routes deliberately not guarded by a single authorize(module, action).
 * Reviewed against ADM-01/02/13 and ADR-008/014. Each entry says what guards it instead.
 */
const ADMIN_UNGUARDED: Record<string, 'any-admin' | 'super-only' | 'any-of-modules' | 'per-record-type'> = {
  'GET /me': 'any-admin',
  'GET /overview': 'any-admin', // widgets filtered by grant inside the handler (ADM-01)
  'GET /audit/events': 'super-only',
  'GET /audit/records/:type/:id': 'per-record-type',
  'GET /notifications/outbox': 'super-only',
  'POST /holidays': 'super-only',
  'DELETE /holidays/:date': 'super-only',
  'GET /expansion-votes': 'super-only', // ADM-03A; BUG-QA-002 fixed in e0290b0
  'GET /community-options': 'any-of-modules',
  'GET /service-options': 'any-of-modules',
  'GET /cluster-options': 'any-of-modules',
};

/** Guarded by authorize(), but the handler additionally restricts to the Super Admin. Keep empty: use superAdminOnly(). */
const SUPER_ONLY_INSIDE_HANDLER = new Set<string>();

/**
 * Known bugs, kept as expected failures (it.fails) until the lead fixes them.
 * See docs/testing/BUGS.md.
 */
const KNOWN_BUGS: Record<string, Record<string, string>> = {
  // BUG-QA-001 and BUG-QA-002 were fixed in e0290b0 (superAdminOnly() before validation).
  noGrants403: {},
  onlyGrantPasses: {},
};
const itMaybeFails = (bucket: keyof typeof KNOWN_BUGS, k: string) => (KNOWN_BUGS[bucket]![k] ? it.fails : it);

const UUID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const concrete = (path: string) =>
  path
    .replace(':date', '2026-12-25')
    .replace(':type', 'community')
    .replace(/:\w+/g, UUID);

const ROUTES = discoverRoutes();
const adminRoutes = ROUTES.filter((r) => ADMIN_FNS.has(r.fn));
const key = (r: RouteDef) => `${r.method.toUpperCase()} ${r.path}`;

// ---------------------------------------------------------------- actors
const ids = {
  none: '10000000-0000-4000-8000-000000000001',
  everythingGrantable: '10000000-0000-4000-8000-000000000002',
  superAdmin: '10000000-0000-4000-8000-000000000003',
};
const grantable: GrantKey[] = allCatalogueGrants()
  .filter((g) => isGrantable(g.module))
  .map((g) => grantKey(g.module, g.action));

const admins: Parameters<typeof fakeDeps>[0] = {
  [ids.none]: { status: 'ACTIVE', actor: actor({ id: ids.none }) },
  [ids.everythingGrantable]: { status: 'ACTIVE', actor: actor({ id: ids.everythingGrantable, grants: grantable }) },
  [ids.superAdmin]: { status: 'ACTIVE', actor: actor({ id: ids.superAdmin, isSuperAdmin: true }) },
};
// One admin per grant ("only this grant") and one per grant ("every grant except this one").
const onlyId = (g: GrantKey) => `only-${g.replace(":", "-")}`;
const allButId = (g: GrantKey) => `allbut-${g.replace(":", "-")}`;
for (const g of allCatalogueGrants().map((x) => grantKey(x.module, x.action))) {
  admins[onlyId(g)] = { status: 'ACTIVE', actor: actor({ id: onlyId(g), grants: [g] }) };
  admins[allButId(g)] = { status: 'ACTIVE', actor: actor({ id: allButId(g), grants: grantable.filter((x) => x !== g) }) };
}

const app = createApp(fakeDeps(admins));
const send = (r: RouteDef, prefix: string, headers: Record<string, string> = {}) => {
  const req = request(app)[r.method](`${prefix}${concrete(r.path)}`).set(headers);
  // A well-formed but empty JSON body: validation (400) may run after authZ, never before it.
  return r.method === 'get' || r.method === 'delete' ? req : req.send({});
};
const as = (id: string) => ({ Authorization: `Bearer token:aal2:${id}` });

/** Every route layer Express actually mounted, so discovery cannot silently miss routes. */
function countMountedRoutes(stack: Router['stack']): number {
  let n = 0;
  for (const layer of stack) {
    if (layer.route) n += 1;
    const inner = (layer.handle as unknown as { stack?: Router['stack'] }).stack;
    if (inner) n += countMountedRoutes(inner);
  }
  return n;
}

describe('route discovery', () => {
  it('finds every route Express mounts', () => {
    const mounted = countMountedRoutes((app as unknown as { router: Router }).router.stack);
    // inboxRoutes is mounted twice (resident and employee apps).
    const inbox = ROUTES.filter((r) => r.fn === 'inboxRoutes').length;
    // + GET /health and GET /ready, declared in app.ts.
    expect(ROUTES.length + inbox + 2).toBe(mounted);
  });

  it('knows which app every route function belongs to', () => {
    const known = new Set([...ADMIN_FNS, ...RESIDENT_FNS, ...EMPLOYEE_FNS, ...UNAUTHENTICATED_FNS, 'inboxRoutes']);
    expect([...new Set(ROUTES.map((r) => r.fn))].filter((fn) => !known.has(fn))).toEqual([]);
  });

  it('every admin route is either guarded by authorize() or on the reviewed allowlist', () => {
    const unguarded = adminRoutes.filter((r) => !r.guard).map(key).sort();
    expect(unguarded).toEqual(Object.keys(ADMIN_UNGUARDED).sort());
  });

  it('every guard names a real module:action from the permission catalogue', () => {
    const bad = adminRoutes.filter((r) => r.guard && !(MODULES[r.guard.module]?.actions as readonly string[] | undefined)?.includes(r.guard.action));
    expect(bad.map(key)).toEqual([]);
  });

  it('every ADM module has at least one route', () => {
    const covered = new Set(adminRoutes.map((r) => r.guard?.module).filter(Boolean));
    covered.add('overview'); // GET /overview (any admin)
    expect(Object.keys(MODULES).filter((m) => !covered.has(m as ModuleKey))).toEqual([]);
  });
});

describe('admin routes: 401 without a token', () => {
  it.each(adminRoutes.map((r) => [key(r), r] as const))('%s', async (_k, r) => {
    const res = await send(r, '/v1/admin');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('admin routes: a non-MFA (aal1) session gets 403 MFA_REQUIRED', () => {
  it.each(adminRoutes.map((r) => [key(r), r] as const))('%s', async (_k, r) => {
    const res = await send(r, '/v1/admin', { Authorization: `Bearer token:aal1:${ids.superAdmin}` });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MFA_REQUIRED');
  });
});

const guarded = adminRoutes.filter((r) => r.guard);

describe('admin routes: 403 for an admin with no grants', () => {
  for (const r of adminRoutes.filter((x) => ADMIN_UNGUARDED[key(x)] !== 'any-admin')) {
    itMaybeFails('noGrants403', key(r))(key(r), async () => {
      const res = await send(r, '/v1/admin', as(ids.none));
      expect(res.status).toBe(403);
    });
  }
});

describe('admin routes: 403 with every grant except the required module:action', () => {
  it.each(guarded.map((r) => [`${key(r)} needs ${r.guard!.module}:${r.guard!.action}`, r] as const))('%s', async (_k, r) => {
    const g = grantKey(r.guard!.module, r.guard!.action as never);
    const res = await send(r, '/v1/admin', as(isGrantable(r.guard!.module) ? allButId(g) : ids.everythingGrantable));
    expect(res.status).toBe(403);
  });
});

describe('admin routes: authZ passes with only the required grant', () => {
  for (const r of guarded.filter((x) => isGrantable(x.guard!.module))) {
    itMaybeFails('onlyGrantPasses', key(r))(`${key(r)} with ${r.guard!.module}:${r.guard!.action}`, async () => {
      const res = await send(r, '/v1/admin', as(onlyId(grantKey(r.guard!.module, r.guard!.action as never))));
      // The fake DB throws (500) or the body/params fail validation (422): both mean authZ let it through.
      expect([401, 403]).not.toContain(res.status);
    });
  }
});

describe('admin routes: the Super Admin passes authZ everywhere', () => {
  it.each(adminRoutes.map((r) => [key(r), r] as const))('%s', async (_k, r) => {
    const res = await send(r, '/v1/admin', as(ids.superAdmin));
    expect([401, 403]).not.toContain(res.status);
  });
});

describe('Super-Admin-only routes refuse an admin holding every grantable permission', () => {
  const superOnly = adminRoutes.filter((r) => ADMIN_UNGUARDED[key(r)] === 'super-only' || SUPER_ONLY_INSIDE_HANDLER.has(key(r)) || r.guard?.module === 'admin_access');
  it.each(superOnly.map((r) => [key(r), r] as const))('%s', async (_k, r) => {
    let req = request(app)[r.method](`/v1/admin${concrete(r.path)}`).set(as(ids.everythingGrantable));
    // A valid body too, so a 403 here cannot be a validation error in disguise.
    if (key(r) === 'POST /holidays') req = req.send({ date: '2026-12-25', name: 'Christmas' });
    const res = await req;
    expect(res.status).toBe(403);
  });
});

describe('any-of-modules routes', () => {
  it.each([
    ['GET /community-options', 'demand_payments:view'],
    ['GET /community-options', 'scheduling:view'],
  ] as const)('%s passes with %s', async (route, grant) => {
    const r = adminRoutes.find((x) => key(x) === route)!;
    const res = await send(r, '/v1/admin', as(onlyId(grant as GrantKey)));
    expect([401, 403]).not.toContain(res.status);
  });
});

describe('resident app routes: 401 without a token, and for a non-phone (admin/staff) session', () => {
  const residentRoutes = ROUTES.filter((r) => RESIDENT_FNS.has(r.fn) || r.fn === 'inboxRoutes');
  it.each(residentRoutes.map((r) => [key(r), r] as const))('%s', async (_k, r) => {
    expect((await send(r, '/v1/resident')).status).toBe(401);
    // The fake verifier returns no phone: an email session must not open the resident API.
    expect((await send(r, '/v1/resident', as(ids.superAdmin))).status).toBe(401);
  });
});

describe('worker app routes: 401 without a token, and for a non-staff session', () => {
  const employeeRoutes = ROUTES.filter((r) => EMPLOYEE_FNS.has(r.fn) || r.fn === 'inboxRoutes');
  it.each(employeeRoutes.map((r) => [key(r), r] as const))('%s', async (_k, r) => {
    expect((await send(r, '/v1/employee')).status).toBe(401);
    expect((await send(r, '/v1/employee', as(ids.superAdmin))).status).toBe(401);
  });
});

describe('admin tokens never open another app', () => {
  it('a Super Admin token is not accepted by the resident API', async () => {
    expect((await request(app).get('/v1/resident/me').set(as(ids.superAdmin))).status).toBe(401);
  });
  it('a Super Admin token is not accepted by the worker API', async () => {
    expect((await request(app).get('/v1/employee/me').set(as(ids.superAdmin))).status).toBe(401);
  });
});
