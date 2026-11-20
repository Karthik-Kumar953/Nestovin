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
  version: versionSchema,
});
export type AdminTicket = z.infer<typeof adminTicketSchema>;

export const adminTicketDetailSchema = adminTicketSchema.extend({
  description: z.string(),
  updates: z.array(ticketUpdateSchema),
  allowedStatuses: z.array(ticketStatusSchema),
});
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
