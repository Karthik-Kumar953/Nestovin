import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { sql } from 'kysely';
import type { AppDeps } from './http/context';
import { requestId, requireAdmin } from './http/middleware';
import { errorHandler, notFoundHandler } from './http/error-handler';
import { adminAccessRoutes } from './modules/admin-access/routes';
import { locationRoutes } from './modules/locations/routes';
import { publicEnquiryRoutes } from './modules/enquiries/routes';
import { catalogueRoutes } from './modules/catalogue/routes';
import { migrationRoutes } from './modules/migration/routes';

/** Builds the Express app from injected dependencies (no global state; easy to test). */
export function createApp(deps: AppDeps): express.Express {
  const app = express();

  app.disable('x-powered-by');
  // Behind one reverse proxy/load balancer in hosted environments, so req.ip is the client IP.
  app.set('trust proxy', deps.env.NODE_ENV === 'development' || deps.env.NODE_ENV === 'test' ? false : 1);

  app.use(requestId());
  app.use(
    pinoHttp({
      logger: deps.logger,
      genReqId: (req) => (req as express.Request).requestId,
      customProps: (req) => ({ adminId: (req as express.Request).admin?.id }),
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );
  app.use(
    helmet({
      // JSON API: no HTML is served, so lock everything down.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(
    cors({
      origin: deps.env.CORS_ORIGINS,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id', 'X-File-Name'],
      exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Liveness/readiness
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get('/ready', async (_req, res) => {
    await sql`select 1`.execute(deps.db);
    res.json({ status: 'ready' });
  });

  // Public (unauthenticated) endpoints
  app.use('/v1/public', publicEnquiryRoutes(deps));

  // Admin endpoints: every route below requires an authenticated, MFA-verified, active admin.
  const admin = express.Router();
  admin.use(requireAdmin(deps));
  admin.use(adminAccessRoutes(deps));
  admin.use(locationRoutes(deps));
  admin.use(catalogueRoutes(deps));
  admin.use(migrationRoutes(deps));
  app.use('/v1/admin', admin);

  app.use(notFoundHandler());
  app.use(errorHandler(deps.logger));
  return app;
}
