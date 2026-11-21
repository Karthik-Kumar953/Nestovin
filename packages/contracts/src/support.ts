import { z } from 'zod';
import { uuidSchema, versionSchema } from './common';

/*
 * Support tickets (RES-12, ADM-13) and website enquiries (WEB-10).
 * Escalation to Cluster Admin / Super Admin and working-day deadlines arrive in Phase 7.
 */

export const TICKET_STATUSES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'] as const;
export const ticketStatusSchema = z.enum(TICKET_STATUSES);
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

/** Allowed status moves (validated in the API). */
export const TICKET_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  OPEN: ['ASSIGNED', 'IN_PROGRESS', 'WAITING', 'RESOLVED'],
  ASSIGNED: ['IN_PROGRESS', 'WAITING', 'RESOLVED', 'OPEN'],
  IN_PROGRESS: ['WAITING', 'RESOLVED', 'ASSIGNED'],
  WAITING: ['IN_PROGRESS', 'RESOLVED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
};

export const ticketPrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH']);

export const ticketCategorySchema = z.object({ id: uuidSchema, name: z.string(), status: z.enum(['ACTIVE', 'INACTIVE']), sort: z.number().int() });
export type TicketCategory = z.infer<typeof ticketCategorySchema>;

export const upsertTicketCategorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  sort: z.number().int().min(0).max(999).optional(),
});
export type UpsertTicketCategoryInput = z.infer<typeof upsertTicketCategorySchema>;

export const ticketUpdateSchema = z.object({
  id: z.string(),
  authorKind: z.enum(['admin', 'resident', 'system']),
  authorName: z.string().nullable(),
  visibility: z.enum(['INTERNAL', 'RESIDENT']),
  body: z.string(),
  createdAt: z.iso.datetime(),
});
export type TicketUpdate = z.infer<typeof ticketUpdateSchema>;

export const ticketSummarySchema = z.object({
  id: uuidSchema,
  reference: z.string(),
  subject: z.string(),
  categoryId: uuidSchema,
  categoryName: z.string(),
  priority: ticketPrioritySchema,
  urgent: z.boolean(),
  status: ticketStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type TicketSummary = z.infer<typeof ticketSummarySchema>;

export const ticketDetailSchema = ticketSummarySchema.extend({
  description: z.string(),
  updates: z.array(ticketUpdateSchema),
});
export type TicketDetail = z.infer<typeof ticketDetailSchema>;

export const adminTicketSchema = ticketSummarySchema.extend({
  resident: z.object({ id: uuidSchema, fullName: z.string().nullable(), phone: z.string() }),
  flat: z.object({ flatNumber: z.string(), towerName: z.string(), communityName: z.string() }).nullable(),
  ownerAdminId: uuidSchema.nullable(),
  ownerName: z.string().nullable(),
  escalationLevel: z.enum(['NONE', 'CLUSTER_ADMIN', 'SUPER_ADMIN']),
  /** Next escalation deadline (working days, ADR-014). */
  dueAt: z.string().nullable(),
  overdue: z.boolean(),
  version: versionSchema,
});
export type AdminTicket = z.infer<typeof adminTicketSchema>;

export const ticketVisitSchema = z.object({
  occurrenceId: uuidSchema,
  scheduledDate: z.string(),
  startsAt: z.string().nullable(),
  serviceName: z.string(),
  status: z.string(),
  workerName: z.string().nullable(),
});
export type TicketVisit = z.infer<typeof ticketVisitSchema>;

/**
 * Linked context shown beside a ticket (ADM-13): the resident's flat, live
 * bookings/subscriptions, recent payments and visits. Everything is limited to
 * the admin's clusters, so a list can be shorter than the resident's full history.
 */
export const ticketContextSchema = z.object({
  flat: z
    .object({
      flatId: uuidSchema,
      flatNumber: z.string(),
      towerName: z.string(),
      communityId: uuidSchema,
      communityName: z.string(),
    })
    .nullable(),
  /** Bookings that are live: waiting for payment, confirmed, under review, or with an active subscription. */
  bookings: z.array(
    z.object({
      bookingId: uuidSchema,
      reference: z.string(),
      planName: z.string(),
      selectionLabel: z.string(),
      status: z.string(),
      startDate: z.string(),
      totalPaise: z.number().int(),
      outstandingPaise: z.number().int(),
      subscription: z.object({ id: uuidSchema, status: z.string(), periodStart: z.string(), periodEnd: z.string() }).nullable(),
    }),
  ),
  /** Last 5 payment orders, newest first. */
  payments: z.array(
    z.object({
      id: uuidSchema,
      purpose: z.enum(['INITIAL', 'BALANCE', 'FULL']),
      amountPaise: z.number().int(),
      status: z.enum(['CREATED', 'PAID', 'FAILED', 'EXPIRED', 'REVIEW_REQUIRED']),
      createdAt: z.string(),
      paidAt: z.string().nullable(),
    }),
  ),
  /** Last 5 visits before today (newest first) and the next 5 from today (soonest first). */
  recentVisits: z.array(ticketVisitSchema),
  upcomingVisits: z.array(ticketVisitSchema),
});
export type TicketContext = z.infer<typeof ticketContextSchema>;

export const adminTicketDetailSchema = adminTicketSchema.extend({
  description: z.string(),
  updates: z.array(ticketUpdateSchema),
  allowedStatuses: z.array(ticketStatusSchema),
  escalations: z.array(z.object({ level: z.string(), trigger: z.string(), reason: z.string().nullable(), notified: z.number().int(), at: z.string() })),
  /** Present on GET /tickets/:id only (not on the responses of write calls). */
  context: ticketContextSchema.optional(),
});

/** GET /tickets/:id/assignees — admins the ticket can be assigned to. */
export const ticketAssigneeSchema = z.object({
  id: uuidSchema,
  fullName: z.string(),
  email: z.string(),
  title: z.string().nullable(),
  isSuperAdmin: z.boolean(),
  scopeType: z.enum(['GLOBAL', 'CLUSTERS']),
  isCurrentOwner: z.boolean(),
  /** Open tickets this admin currently owns (among those visible to the caller), to help balance work. */
  openTickets: z.number().int(),
});
export type TicketAssignee = z.infer<typeof ticketAssigneeSchema>;

/** POST /tickets/:id/assign */
export const assignTicketSchema = z.object({ adminId: uuidSchema });
export type AssignTicketInput = z.infer<typeof assignTicketSchema>;
export const escalateTicketSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export const holidaySchema = z.object({ date: z.iso.date(), name: z.string().trim().min(2).max(80) });
export type Holiday = z.infer<typeof holidaySchema>;
export type AdminTicketDetail = z.infer<typeof adminTicketDetailSchema>;

export const createTicketSchema = z.object({
  categoryId: uuidSchema,
  subject: z.string().trim().min(3).max(140),
  description: z.string().trim().min(5).max(4000),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const residentReplySchema = z.object({ body: z.string().trim().min(1).max(4000) });
export type ResidentReplyInput = z.infer<typeof residentReplySchema>;

export const adminTicketUpdateSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  visibility: z.enum(['INTERNAL', 'RESIDENT']),
});
export type AdminTicketUpdateInput = z.infer<typeof adminTicketUpdateSchema>;

export const patchTicketSchema = z.object({
  categoryId: uuidSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  urgent: z.boolean().optional(),
  /** null = unassign. */
  ownerAdminId: uuidSchema.nullable().optional(),
  status: ticketStatusSchema.optional(),
  version: versionSchema,
});
export type PatchTicketInput = z.infer<typeof patchTicketSchema>;

// ---------------------------------------------------------------- enquiries

export const enquiryStatusSchema = z.enum(['NEW', 'IN_PROGRESS', 'CLOSED']);

export const adminEnquirySchema = z.object({
  id: uuidSchema,
  reference: z.string(),
  name: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  city: z.string().nullable(),
  community: z.string().nullable(),
  message: z.string(),
  status: enquiryStatusSchema,
  routingStatus: z.enum(['PENDING', 'ROUTED', 'FAILED']),
  createdAt: z.iso.datetime(),
});
export type AdminEnquiry = z.infer<typeof adminEnquirySchema>;

export const patchEnquirySchema = z.object({ status: enquiryStatusSchema });
export type PatchEnquiryInput = z.infer<typeof patchEnquirySchema>;
