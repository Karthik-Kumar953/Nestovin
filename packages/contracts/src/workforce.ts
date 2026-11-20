import { z } from 'zod';
import { uuidSchema, versionSchema } from './common';
import { indianOrE164PhoneSchema } from './residents';

/*
 * Phase 5: applicants (EMP-01), employees and readiness (ADM-09), availability
 * and leave (EMP-09), training links (EMP-04), allocation (ADM-11, ADR-005).
 */

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');
const isoDate = z.iso.date();

// ---------------------------------------------------------------- applicants

export const applicantStatusSchema = z.enum(['NEW', 'IN_REVIEW', 'REJECTED', 'CONVERTED']);
export const createApplicantSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: indianOrE164PhoneSchema,
  city: z.string().trim().max(80).optional(),
  services: z.array(z.enum(['MAID', 'COOK', 'CARETAKER'])).max(3).default([]),
  experienceNote: z.string().trim().max(1000).optional(),
  /** Honeypot (public form). */
  website: z.string().max(200).optional(),
});
export type CreateApplicantInput = z.infer<typeof createApplicantSchema>;

export const applicantSchema = z.object({
  id: uuidSchema,
  fullName: z.string(),
  phone: z.string(),
  city: z.string().nullable(),
  preferredClusterId: uuidSchema.nullable(),
  services: z.array(z.string()),
  experienceNote: z.string().nullable(),
  source: z.enum(['APP', 'ADMIN']),
  status: applicantStatusSchema,
  reviewNote: z.string().nullable(),
  createdAt: z.string(),
  version: versionSchema,
});
export type Applicant = z.infer<typeof applicantSchema>;

export const reviewApplicantSchema = z.object({
  status: z.enum(['IN_REVIEW', 'REJECTED']),
  note: z.string().trim().max(500).optional(),
  preferredClusterId: uuidSchema.nullable().optional(),
  version: versionSchema,
});
export const convertApplicantSchema = z.object({ homeClusterId: uuidSchema, joinedOn: isoDate.optional(), version: versionSchema });

// ---------------------------------------------------------------- employees

export const employeeSchema = z.object({
  id: uuidSchema,
  employeeCode: z.string(),
  fullName: z.string(),
  phone: z.string(),
  homeClusterId: uuidSchema,
  homeClusterName: z.string(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'EXITED']),
  readiness: z.enum(['NOT_READY', 'READY']),
  readinessNote: z.string().nullable(),
  joinedOn: z.string().nullable(),
  loginEnabled: z.boolean(),
  services: z.array(z.object({ serviceId: uuidSchema, name: z.string() })),
  version: versionSchema,
});
export type Employee = z.infer<typeof employeeSchema>;

export const employeeDetailSchema = employeeSchema.extend({
  verifications: z.array(
    z.object({ itemId: uuidSchema, name: z.string(), required: z.boolean(), status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']).nullable(), note: z.string().nullable(), reviewedAt: z.string().nullable() }),
  ),
  availability: z.array(z.object({ id: uuidSchema, daysOfWeek: z.number().int(), startTime: z.string(), endTime: z.string() })),
  training: z.array(z.object({ itemId: uuidSchema, title: z.string(), completedAt: z.string().nullable() })),
  /** What still blocks READY (required checks not verified, no qualification). */
  readinessGaps: z.array(z.string()),
});
export type EmployeeDetail = z.infer<typeof employeeDetailSchema>;

export const createEmployeeSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: indianOrE164PhoneSchema,
  homeClusterId: uuidSchema,
  joinedOn: isoDate.optional(),
});
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: indianOrE164PhoneSchema.optional(),
  homeClusterId: uuidSchema.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'EXITED']).optional(),
  joinedOn: isoDate.nullable().optional(),
  version: versionSchema,
});
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export const setVerificationSchema = z.object({ status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']), note: z.string().trim().max(500).optional() });
export const setQualificationsSchema = z.object({ serviceIds: z.array(uuidSchema).max(3) });
export const setReadinessSchema = z.object({ readiness: z.enum(['NOT_READY', 'READY']), note: z.string().trim().max(500).optional(), version: versionSchema });
export const availabilitySchema = z.object({
  windows: z.array(z.object({ daysOfWeek: z.number().int().min(1).max(127), startTime: hhmm, endTime: hhmm })).max(14),
});
export type AvailabilityInput = z.infer<typeof availabilitySchema>;

/** Returned ONCE when HR enables login or resets the password (ADR-012). */
export const temporaryPasswordSchema = z.object({ employeeCode: z.string(), temporaryPassword: z.string() });
export type TemporaryPassword = z.infer<typeof temporaryPasswordSchema>;

export const verificationItemSchema = z.object({ id: uuidSchema, name: z.string(), required: z.boolean(), status: z.enum(['ACTIVE', 'INACTIVE']), sort: z.number().int() });
export const upsertVerificationItemSchema = z.object({
  name: z.string().trim().min(2).max(80),
  required: z.boolean().default(true),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
export const trainingItemSchema = z.object({ id: uuidSchema, title: z.string(), url: z.string(), status: z.enum(['ACTIVE', 'INACTIVE']), sort: z.number().int() });
export const upsertTrainingItemSchema = z.object({
  title: z.string().trim().min(2).max(120),
  url: z.url().refine((u) => u.startsWith('https://'), 'Use an https link'),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

// ---------------------------------------------------------------- leave

export const leaveStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']);
export const leaveRequestSchema = z.object({
  id: uuidSchema,
  employee: z.object({ id: uuidSchema, employeeCode: z.string(), fullName: z.string() }),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().nullable(),
  status: leaveStatusSchema,
  reviewNote: z.string().nullable(),
  /** Assignments inside the leave period that will need a replacement. */
  affectedAssignments: z.number().int(),
  createdAt: z.string(),
  version: versionSchema,
});
export type LeaveRequest = z.infer<typeof leaveRequestSchema>;
export const createLeaveSchema = z.object({ startDate: isoDate, endDate: isoDate, reason: z.string().trim().max(500).optional() });
export const decideLeaveSchema = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), note: z.string().trim().max(500).optional(), version: versionSchema });

// ---------------------------------------------------------------- allocation

export const allocationNeedSchema = z.object({
  componentId: uuidSchema,
  subscriptionId: uuidSchema,
  serviceId: uuidSchema,
  serviceName: z.string(),
  flat: z.object({ flatNumber: z.string(), towerName: z.string(), communityName: z.string() }),
  residentName: z.string().nullable(),
  startTime: z.string(),
  durationMinutes: z.number().int(),
  daysOfWeek: z.number().int(),
  periodStart: z.string(),
  periodEnd: z.string(),
  standing: z.object({ assignmentId: uuidSchema, employeeId: uuidSchema, employeeCode: z.string(), employeeName: z.string(), effectiveFrom: z.string() }).nullable(),
});
export type AllocationNeed = z.infer<typeof allocationNeedSchema>;

/** Eligible candidates (no ranking: OPEN) with the reasons others were excluded. */
export const candidatesSchema = z.object({
  eligible: z.array(z.object({ employeeId: uuidSchema, employeeCode: z.string(), fullName: z.string(), currentStandingCount: z.number().int(), conflicts: z.array(z.string()) })),
  excluded: z.array(z.object({ employeeId: uuidSchema, employeeCode: z.string(), fullName: z.string(), reasons: z.array(z.string()) })),
});
export type Candidates = z.infer<typeof candidatesSchema>;

export const confirmStandingSchema = z.object({ employeeId: uuidSchema, effectiveFrom: isoDate.optional(), reason: z.string().trim().max(500).optional() });
export type ConfirmStandingInput = z.infer<typeof confirmStandingSchema>;

export const occurrenceSchema = z.object({
  id: uuidSchema,
  scheduledDate: z.string(),
  visitNo: z.number().int(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  status: z.string(),
  serviceName: z.string(),
  flat: z.object({ flatNumber: z.string(), towerName: z.string(), communityName: z.string() }),
  residentName: z.string().nullable(),
  assignment: z.object({ id: uuidSchema, employeeId: uuidSchema, employeeCode: z.string(), employeeName: z.string(), source: z.string() }).nullable(),
});
export type Occurrence = z.infer<typeof occurrenceSchema>;
export const replaceOccurrenceSchema = z.object({ employeeId: uuidSchema, reason: z.string().trim().min(3).max(500) });

// ---------------------------------------------------------------- employee app

export const employeeMeSchema = z.object({
  id: uuidSchema,
  employeeCode: z.string(),
  fullName: z.string(),
  phone: z.string(),
  readiness: z.enum(['NOT_READY', 'READY']),
  mustChangePassword: z.boolean(),
  services: z.array(z.string()),
  verifications: z.array(z.object({ name: z.string(), status: z.string().nullable() })),
  availability: z.array(z.object({ daysOfWeek: z.number().int(), startTime: z.string(), endTime: z.string() })),
  training: z.array(z.object({ itemId: uuidSchema, title: z.string(), url: z.string(), completedAt: z.string().nullable() })),
});
export type EmployeeMe = z.infer<typeof employeeMeSchema>;

export const employeeScheduleItemSchema = z.object({
  occurrenceId: uuidSchema,
  scheduledDate: z.string(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  serviceName: z.string(),
  flat: z.object({ flatNumber: z.string(), towerName: z.string(), communityName: z.string() }),
  status: z.string(),
  source: z.string(),
});
export type EmployeeScheduleItem = z.infer<typeof employeeScheduleItemSchema>;
