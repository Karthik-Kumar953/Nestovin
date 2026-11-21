import { z } from 'zod';
import { uuidSchema, versionSchema } from './common';

/*
 * Phase 4: slots (ADM-10), demand cycles and requests (RES-07, ADM-08),
 * continuous bookings, subscriptions and payments (RES-08/09).
 * Money is integer paise. Prices are tax-inclusive (ADR-015).
 */

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');
const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime({ offset: true });

/** ADR-013: shown to and accepted by the resident before paying the initial amount. */
export const NON_REFUNDABLE_DISCLOSURE = {
  version: '2026-11-20',
  text:
    'The initial payment is a commitment to this demand cycle. If the remaining balance is not paid by the published deadline, ' +
    'the commitment expires and the initial payment is not refunded.',
} as const;

// ---------------------------------------------------------------- selection & quote

/** A plan plus the complete package (serviceId null) or one service, plus optional add-ons. */
export const selectionSchema = z.object({
  planId: uuidSchema,
  serviceId: uuidSchema.nullable(),
  addonComponentIds: z.array(uuidSchema).max(5).default([]),
});
export type SelectionInput = z.infer<typeof selectionSchema>;

export const quoteSchema = z.object({
  planName: z.string(),
  selectionLabel: z.string(),
  validityDays: z.number().int(),
  totalPaise: z.number().int(),
  initialPct: z.number().int().nullable(),
  initialDuePaise: z.number().int(),
  remainingDuePaise: z.number().int(),
  currency: z.string(),
  taxInclusive: z.literal(true),
});
export type Quote = z.infer<typeof quoteSchema>;

// ---------------------------------------------------------------- slots (ADM-10)

export const slotStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'WITHDRAWN']);
export const slotSchema = z.object({
  id: uuidSchema,
  communityId: uuidSchema,
  mode: z.enum(['CONTINUOUS', 'DEMAND_LED']),
  slotSetId: uuidSchema.nullable(),
  serviceId: uuidSchema.nullable(),
  serviceName: z.string().nullable(),
  label: z.string(),
  startTime: z.string(),
  durationMinutes: z.number().int(),
  daysOfWeek: z.number().int(),
  capacity: z.number().int(),
  /** Households holding the slot (confirmed bookings or allocated requests). */
  used: z.number().int(),
  status: slotStatusSchema,
  version: versionSchema,
});
export type Slot = z.infer<typeof slotSchema>;

export const slotInputSchema = z.object({
  label: z.string().trim().min(1).max(60),
  serviceId: uuidSchema.nullable().optional(),
  startTime: hhmm,
  durationMinutes: z.number().int().min(15).max(720),
  daysOfWeek: z.number().int().min(1).max(127).default(127),
  capacity: z.number().int().min(1).max(10000),
});
export type SlotInput = z.infer<typeof slotInputSchema>;

export const updateSlotSchema = slotInputSchema.partial().extend({
  status: slotStatusSchema.optional(),
  version: versionSchema,
});
export type UpdateSlotInput = z.infer<typeof updateSlotSchema>;

// ---------------------------------------------------------------- demand cycles (ADM-08)

export const demandCycleStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'CLOSED', 'SLOTS_PUBLISHED', 'COMPLETED', 'CANCELLED']);
export type DemandCycleStatus = z.infer<typeof demandCycleStatusSchema>;

export const demandCycleSchema = z.object({
  id: uuidSchema,
  communityId: uuidSchema,
  communityName: z.string(),
  name: z.string(),
  opensAt: z.string(),
  closesAt: z.string(),
  initialPct: z.number().int().nullable(),
  status: demandCycleStatusSchema,
  planIds: z.array(uuidSchema),
  publishedAt: z.string().nullable(),
  committedCount: z.number().int(),
  version: versionSchema,
});
export type DemandCycle = z.infer<typeof demandCycleSchema>;

const cycleFields = {
  name: z.string().trim().min(1).max(80),
  opensAt: isoDateTime,
  closesAt: isoDateTime,
  /** Whole percentage 1–99, locked at publication. */
  initialPct: z.number().int().min(1).max(99).nullable().optional(),
  planIds: z.array(uuidSchema).max(50),
};
export const createDemandCycleSchema = z.object(cycleFields);
export type CreateDemandCycleInput = z.infer<typeof createDemandCycleSchema>;
export const updateDemandCycleSchema = z.object(cycleFields).partial().extend({ version: versionSchema });
export type UpdateDemandCycleInput = z.infer<typeof updateDemandCycleSchema>;
export const versionOnlySchema = z.object({ version: versionSchema });
/** Only the close time can move after publication (extension), with a reason. */
export const extendCycleSchema = z.object({ closesAt: isoDateTime, reason: z.string().trim().min(3).max(500), version: versionSchema });

export const demandSummarySchema = z.object({
  cycleId: uuidSchema,
  totals: z.object({
    awaitingPayment: z.number().int(),
    committed: z.number().int(),
    balanceDue: z.number().int(),
    converted: z.number().int(),
    expired: z.number().int(),
    reviewRequired: z.number().int(),
    initialCollectedPaise: z.number().int(),
  }),
  /** Verified commitments only (COMMITTED and later). */
  bySelection: z.array(z.object({ planName: z.string(), selectionLabel: z.string(), count: z.number().int() })),
  byPreferredWindow: z.array(z.object({ windowName: z.string(), firstChoice: z.number().int(), anyChoice: z.number().int() })),
});
export type DemandSummary = z.infer<typeof demandSummarySchema>;

export const demandRequestStatusSchema = z.enum(['AWAITING_PAYMENT', 'COMMITTED', 'BALANCE_DUE', 'CONVERTED', 'EXPIRED', 'CANCELLED', 'REVIEW_REQUIRED']);
export type DemandRequestStatus = z.infer<typeof demandRequestStatusSchema>;

const flatRef = z.object({ flatNumber: z.string(), towerName: z.string(), communityName: z.string() });

export const adminDemandRequestSchema = z.object({
  id: uuidSchema,
  reference: z.string(),
  status: demandRequestStatusSchema,
  resident: z.object({ id: uuidSchema, fullName: z.string().nullable(), phone: z.string() }),
  flat: flatRef,
  planName: z.string(),
  selectionLabel: z.string(),
  totalPaise: z.number().int(),
  initialPaidPaise: z.number().int(),
  remainingDuePaise: z.number().int(),
  preferredWindows: z.array(z.string()),
  allocatedSlotId: uuidSchema.nullable(),
  createdAt: z.string(),
});
export type AdminDemandRequest = z.infer<typeof adminDemandRequestSchema>;

export const slotSetSchema = z.object({
  id: uuidSchema,
  cycleId: uuidSchema,
  status: slotStatusSchema,
  commencementDate: z.string(),
  balanceDueAt: z.string(),
  publishedAt: z.string().nullable(),
  slots: z.array(slotSchema),
  version: versionSchema,
});
export type SlotSet = z.infer<typeof slotSetSchema>;

export const createSlotSetSchema = z.object({ commencementDate: isoDate, balanceDueAt: isoDateTime });
export type CreateSlotSetInput = z.infer<typeof createSlotSetSchema>;
export const allocateSchema = z.object({
  allocations: z.array(z.object({ requestId: uuidSchema, slotId: uuidSchema.nullable() })).min(1).max(500),
});
export type AllocateInput = z.infer<typeof allocateSchema>;
export const extendBalanceSchema = z.object({ balanceDueAt: isoDateTime, reason: z.string().trim().min(3).max(500), version: versionSchema });
export type ExtendBalanceInput = z.infer<typeof extendBalanceSchema>;

// ---------------------------------------------------------------- bookings & subscriptions

export const bookingStatusSchema = z.enum(['PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'REVIEW_REQUIRED']);
export const subscriptionStatusSchema = z.enum(['PENDING_ACTIVATION', 'ACTIVE', 'ENDED', 'CANCELLED']);

export const subscriptionViewSchema = z.object({
  id: uuidSchema,
  periodStart: z.string(),
  periodEnd: z.string(),
  status: subscriptionStatusSchema,
  renewable: z.boolean(),
});

export const bookingViewSchema = z.object({
  id: uuidSchema,
  reference: z.string(),
  mode: z.enum(['DEMAND_LED', 'CONTINUOUS']),
  status: bookingStatusSchema,
  planName: z.string(),
  selectionLabel: z.string(),
  slot: z.object({ label: z.string(), startTime: z.string(), durationMinutes: z.number().int(), daysOfWeek: z.number().int() }),
  startDate: z.string(),
  totalPaise: z.number().int(),
  paidPaise: z.number().int(),
  outstandingPaise: z.number().int(),
  balanceDueAt: z.string().nullable(),
  subscription: subscriptionViewSchema.nullable(),
  createdAt: z.string(),
});
export type BookingView = z.infer<typeof bookingViewSchema>;

/** GET /v1/resident/bookings/:id — the booking with what was agreed and every payment attempt. */
export const bookingDetailSchema = bookingViewSchema.extend({
  terms: z.object({
    components: z.array(
      z.object({
        serviceName: z.string(),
        isAddon: z.boolean(),
        visitsPerDay: z.number().int(),
        daysOfWeek: z.number().int(),
        durationMinutes: z.number().int(),
        addonHours: z.number().nullable(),
        tasks: z.array(z.object({ name: z.string(), frequency: z.string(), timesPerPeriod: z.number().int() })),
      }),
    ),
    initialPct: z.number().int().nullable(),
    taxPaise: z.number().int().nullable(),
    validityDays: z.number().int(),
    disclosureVersion: z.string().nullable(),
    disclosureAcceptedAt: z.string().nullable(),
  }),
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
});
export type BookingDetail = z.infer<typeof bookingDetailSchema>;

export const adminBookingSchema = bookingViewSchema.extend({
  resident: z.object({ id: uuidSchema, fullName: z.string().nullable(), phone: z.string() }),
  flat: flatRef,
  version: versionSchema,
});
export type AdminBooking = z.infer<typeof adminBookingSchema>;

// ---------------------------------------------------------------- resident app

export const residentDemandRequestSchema = z.object({
  id: uuidSchema,
  reference: z.string(),
  cycleName: z.string(),
  status: demandRequestStatusSchema,
  planName: z.string(),
  selectionLabel: z.string(),
  totalPaise: z.number().int(),
  initialPct: z.number().int(),
  initialDuePaise: z.number().int(),
  initialPaidPaise: z.number().int(),
  remainingDuePaise: z.number().int(),
  preferredWindows: z.array(z.string()),
  bookingId: uuidSchema.nullable(),
  createdAt: z.string(),
});
export type ResidentDemandRequest = z.infer<typeof residentDemandRequestSchema>;

export const bookingOptionsSchema = z.object({
  /** Verified residence required (ADR-015). */
  eligible: z.boolean(),
  reason: z.string().nullable(),
  /** Machine-readable reason when not eligible; null when eligible. */
  reasonCode: z.enum(['NOT_REGISTERED', 'NOT_VERIFIED', 'NO_CATEGORY', 'COMMUNITY_NOT_LIVE']).nullable(),
  communityName: z.string().nullable(),
  openCycles: z.array(
    z.object({
      id: uuidSchema,
      name: z.string(),
      closesAt: z.string(),
      initialPct: z.number().int(),
      planIds: z.array(uuidSchema),
      timeWindows: z.array(z.object({ id: uuidSchema, name: z.string(), startTime: z.string(), endTime: z.string() })),
    }),
  ),
  continuousSlots: z.array(
    z.object({
      id: uuidSchema,
      label: z.string(),
      serviceId: uuidSchema.nullable(),
      startTime: z.string(),
      durationMinutes: z.number().int(),
      daysOfWeek: z.number().int(),
      available: z.boolean(),
    }),
  ),
  startDateRange: z.object({ from: z.string(), to: z.string() }),
  disclosure: z.object({ version: z.string(), text: z.string() }),
});
export type BookingOptions = z.infer<typeof bookingOptionsSchema>;

export const createDemandRequestSchema = z.object({
  cycleId: uuidSchema,
  selection: selectionSchema,
  preferredWindowIds: z.array(uuidSchema).min(1).max(3),
  acceptNonRefundable: z.literal(true, { error: 'Accept the non-refundable initial payment terms to continue' }),
  disclosureVersion: z.string().min(1),
});
export type CreateDemandRequestInput = z.infer<typeof createDemandRequestSchema>;

export const createBookingSchema = z.object({
  slotId: uuidSchema,
  selection: selectionSchema,
  startDate: isoDate,
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

/** What the app needs to open Razorpay Checkout. */
export const checkoutSchema = z.object({
  paymentOrderId: uuidSchema,
  providerOrderId: z.string(),
  keyId: z.string(),
  amountPaise: z.number().int(),
  currency: z.string(),
  description: z.string(),
});
export type Checkout = z.infer<typeof checkoutSchema>;

export const verifyPaymentSchema = z.object({
  paymentOrderId: uuidSchema,
  providerPaymentId: z.string().min(1).max(64),
  signature: z.string().min(1).max(256),
});
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

export const paymentResultSchema = z.object({
  orderStatus: z.enum(['CREATED', 'PAID', 'FAILED', 'EXPIRED', 'REVIEW_REQUIRED']),
  message: z.string(),
});
export type PaymentResult = z.infer<typeof paymentResultSchema>;

// ---------------------------------------------------------------- admin payments

export const adminPaymentSchema = z.object({
  id: uuidSchema,
  purpose: z.enum(['INITIAL', 'BALANCE', 'FULL']),
  refType: z.enum(['DEMAND_REQUEST', 'BOOKING']),
  refId: uuidSchema,
  reference: z.string().nullable(),
  amountPaise: z.number().int(),
  status: z.enum(['CREATED', 'PAID', 'FAILED', 'EXPIRED', 'REVIEW_REQUIRED']),
  resident: z.object({ id: uuidSchema, fullName: z.string().nullable(), phone: z.string() }),
  providerOrderId: z.string().nullable(),
  transaction: z
    .object({
      id: uuidSchema,
      providerPaymentId: z.string(),
      amountPaise: z.number().int(),
      method: z.string().nullable(),
      status: z.enum(['CAPTURED', 'REFUNDED', 'PARTIALLY_REFUNDED']),
      refundedPaise: z.number().int(),
      verifiedAt: z.string(),
    })
    .nullable(),
  createdAt: z.string(),
});
export type AdminPayment = z.infer<typeof adminPaymentSchema>;

export const paymentExceptionSchema = z.object({
  id: uuidSchema,
  reasonCode: z.string(),
  detail: z.string().nullable(),
  status: z.enum(['OPEN', 'RESOLVED']),
  paymentOrderId: uuidSchema.nullable(),
  transactionId: uuidSchema.nullable(),
  amountPaise: z.number().int().nullable(),
  resident: z.object({ fullName: z.string().nullable(), phone: z.string() }).nullable(),
  resolutionNote: z.string().nullable(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});
export type PaymentException = z.infer<typeof paymentExceptionSchema>;

export const resolveExceptionSchema = z.object({ note: z.string().trim().min(3).max(500) });
export const approveRefundSchema = z.object({
  amountPaise: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});
export type ApproveRefundInput = z.infer<typeof approveRefundSchema>;

export const settingsSchema = z.object({ bookingWindowDays: z.number().int().min(1).max(60) });
export type Settings = z.infer<typeof settingsSchema>;
