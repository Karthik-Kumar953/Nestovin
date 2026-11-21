import { z } from 'zod';
import { uuidSchema } from './common';

/*
 * ADM-01 admin home dashboard (GET /v1/admin/overview/dashboard).
 * Every number is limited to the caller's clusters. A section is present only
 * when the caller holds the module grant it needs, and each section reports its
 * own status, so one failing query never hides the rest of the page.
 */

/** A section that loaded (`data` set) or could not be loaded right now (`data` null). */
export function dashboardSection<T extends z.ZodType>(data: T) {
  return z.object({
    status: z.enum(['ok', 'unavailable']),
    data: data.nullable(),
  });
}

export const dashboardQueueSchema = z.object({
  key: z.enum([
    'residence_verifications',
    'family_requests',
    'change_requests',
    'import_batches',
    'tickets_open',
    'tickets_overdue',
    'tickets_escalated',
    'visits_unassigned',
    'payments_review',
    'payment_exceptions',
    'leave_requests',
    'attendance_flags',
    'attendance_corrections',
    'payroll_approval',
  ]),
  label: z.string(),
  /** Module that owns the queue (matches the permission catalogue). */
  module: z.string(),
  /** Admin portal route for the queue. */
  to: z.string(),
  status: z.enum(['ok', 'unavailable']),
  /** null when status is unavailable. */
  count: z.number().int().nullable(),
});
export type DashboardQueue = z.infer<typeof dashboardQueueSchema>;

export const dashboardVisitPointSchema = z.object({
  date: z.iso.date(),
  /** Visits planned for the day (anything not cancelled). */
  scheduled: z.number().int(),
  completed: z.number().int(),
  noShow: z.number().int(),
});
export const dashboardPaymentPointSchema = z.object({
  date: z.iso.date(),
  /** Sum of payments captured that day (verified transactions), integer paise. */
  capturedPaise: z.number().int(),
  count: z.number().int(),
});
export const dashboardCountPointSchema = z.object({ date: z.iso.date(), count: z.number().int() });

export const adminDashboardSchema = z.object({
  generatedAt: z.iso.datetime(),
  /** Calendar days are India time. */
  timezone: z.literal('Asia/Kolkata'),
  /** Inclusive 30-day window of the time series. */
  range: z.object({ from: z.iso.date(), to: z.iso.date() }),
  scope: z.object({ type: z.enum(['GLOBAL', 'CLUSTERS']), clusterIds: z.array(uuidSchema) }),
  sections: z.object({
    queues: dashboardSection(z.object({ items: z.array(dashboardQueueSchema) })).optional(),
    /** attendance:view or allocation:view */
    visitsDaily: dashboardSection(
      z.object({ points: z.array(dashboardVisitPointSchema) }),
    ).optional(),
    /** demand_payments:view */
    paymentsDaily: dashboardSection(
      z.object({ points: z.array(dashboardPaymentPointSchema) }),
    ).optional(),
    /** demand_payments:view */
    subscriptionsDaily: dashboardSection(
      z.object({ points: z.array(dashboardCountPointSchema) }),
    ).optional(),
    /** demand_payments:view */
    activeSubscriptionsByService: dashboardSection(
      z.object({
        items: z.array(
          z.object({ serviceId: uuidSchema, serviceName: z.string(), count: z.number().int() }),
        ),
      }),
    ).optional(),
    /** employees:view — active workers only. */
    workersByReadiness: dashboardSection(
      z.object({
        items: z.array(
          z.object({ readiness: z.enum(['READY', 'NOT_READY']), count: z.number().int() }),
        ),
      }),
    ).optional(),
    /** support:view — open tickets, and tickets raised in the 30-day window, per category. */
    ticketsByCategory: dashboardSection(
      z.object({
        items: z.array(
          z.object({
            categoryId: uuidSchema,
            categoryName: z.string(),
            open: z.number().int(),
            raised: z.number().int(),
          }),
        ),
      }),
    ).optional(),
  }),
});
export type AdminDashboard = z.infer<typeof adminDashboardSchema>;
export type DashboardSections = AdminDashboard['sections'];
