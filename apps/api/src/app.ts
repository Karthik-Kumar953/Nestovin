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
import { residentAdminRoutes, residentRoutes } from './modules/residents/routes';
import { supportAdminRoutes } from './modules/support/routes';
import { bookingAdminRoutes, razorpayWebhookRoutes, residentBookingRoutes } from './modules/bookings/routes';
import { PaymentService } from './modules/bookings/payments';
import { employeeRoutes, publicApplicantRoutes, workforceAdminRoutes } from './modules/workforce/routes';
import { attendanceAdminRoutes, employeeVisitRoutes, residentVisitRoutes } from './modules/attendance/routes';
import { overviewRoutes } from './modules/overview/routes';
import { auditRoutes } from './modules/audit/routes';
import { exportRoutes } from './modules/exports/routes';
import { inboxRoutes, notificationAdminRoutes } from './modules/notifications/routes';
import { supabaseHookRoutes } from './modules/auth-hooks/routes';
import { employeePayslipRoutes, payrollAdminRoutes } from './modules/payroll/routes';

/** Builds the Express app from injected dependencies (no global state; easy to test). */
export function createApp(deps: AppDeps, payments = new PaymentService(deps.db, deps.payments, deps.logger)): express.Express {
  const app = express();

  app.disable('x-powered-by');
  // Behind one reverse proxy/load balancer in hosted environments, so req.ip is the client IP.
  app.set('trust proxy', deps.env.NODE_ENV === 'development' || deps.env.NODE_ENV === 'test' ? false : 1);

  app.use(requestId());
  app.use(
    pinoHttp({
      logger: deps.logger,
      genReqId: (req) => (req as express.Request).requestId,
      customProps: (req) => ({ adminId: (req as express.Request).admin?.id, residentId: (req as express.Request).resident?.id }),
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
      // In development, also allow the Expo web previews of the Resident (8081) and Worker (8082) apps.
      origin:
        deps.env.NODE_ENV === 'development'
          ? [...deps.env.CORS_ORIGINS, 'http://localhost:8081', 'http://localhost:8082']
          : deps.env.CORS_ORIGINS,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id', 'X-File-Name'],
      exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
      maxAge: 600,
    }),
  );
  // Webhooks need the raw body for signature verification: mounted before the JSON parser.
  app.use('/v1/webhooks', razorpayWebhookRoutes(payments));
  app.use('/v1/hooks', supabaseHookRoutes(deps.env, deps.sms, deps.logger));
  // Small JSON bodies everywhere, except the dashboard migration table (up to 20,000 rows).
  const jsonSmall = express.json({ limit: '100kb' });
  const jsonLarge = express.json({ limit: '4mb' });
  app.use((req, res, next) => (/\/import-grid(\/validate)?$/.test(req.path) ? jsonLarge(req, res, next) : jsonSmall(req, res, next)));
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
  app.use('/v1/public', publicApplicantRoutes(deps));

  // Worker app: Employee ID session required (requireEmployee inside the router).
  app.use('/v1/employee', employeeRoutes(deps, employeeVisitRoutes(deps), employeePayslipRoutes(deps), inboxRoutes(deps, 'employee')));

  // Resident app endpoints: phone-OTP session required (requireResident inside the router).
  app.use('/v1/resident', residentRoutes(deps, residentBookingRoutes(deps, payments), residentVisitRoutes(deps), inboxRoutes(deps, 'resident')));

  // Admin endpoints: every route below requires an authenticated, MFA-verified, active admin.
  const admin = express.Router();
  admin.use(requireAdmin(deps));
  admin.use(adminAccessRoutes(deps));
  admin.use(locationRoutes(deps));
  admin.use(catalogueRoutes(deps));
  admin.use(migrationRoutes(deps));
  admin.use(residentAdminRoutes(deps));
  admin.use(supportAdminRoutes(deps));
  admin.use(bookingAdminRoutes(deps));
  admin.use(workforceAdminRoutes(deps));
  admin.use(attendanceAdminRoutes(deps));
  admin.use(overviewRoutes(deps));
  admin.use(auditRoutes(deps));
  admin.use(exportRoutes(deps));
  admin.use(notificationAdminRoutes(deps));
  admin.use(payrollAdminRoutes(deps));
  app.use('/v1/admin', admin);

  app.use(notFoundHandler());
  app.use(errorHandler(deps.logger));
  return app;
}
