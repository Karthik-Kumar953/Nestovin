import { z } from 'zod';
import { uuidSchema, versionSchema } from './common';

/*
 * Residents & households (RES-01..05, RES-14, ADM-05, ADM-06; ADR-012).
 * Phone numbers are E.164 (+91XXXXXXXXXX).
 */

export const e164PhoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9][0-9]{7,14}$/, 'Enter the number with country code, e.g. +919876543210');

/** Accepts a 10-digit Indian mobile or an E.164 number; returns E.164. */
export const indianOrE164PhoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .transform((v) => (/^[6-9][0-9]{9}$/.test(v) ? `+91${v}` : v))
  .pipe(e164PhoneSchema);

export const residenceDocTypeSchema = z.enum(['OWNERSHIP_PROOF', 'RENT_AGREEMENT', 'ELECTRICITY_BILL', 'SOCIETY_ID']);
export type ResidenceDocType = z.infer<typeof residenceDocTypeSchema>;
export const RESIDENCE_DOC_LABELS: Record<ResidenceDocType, string> = {
  OWNERSHIP_PROOF: 'Ownership proof (e.g. sale deed)',
  RENT_AGREEMENT: 'Rent agreement',
  ELECTRICITY_BILL: 'Electricity bill',
  SOCIETY_ID: 'Society ID / allotment letter',
};

export const documentMimeSchema = z.enum(['application/pdf', 'image/jpeg', 'image/png']);
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export const membershipStatusSchema = z.enum(['PENDING', 'VERIFIED', 'REJECTED', 'REVOKED', 'ENDED']);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

export const membershipSchema = z.object({
  id: uuidSchema,
  residentId: uuidSchema,
  kind: z.enum(['PRIMARY', 'FAMILY']),
  occupancy: z.enum(['OWNER', 'TENANT', 'FAMILY']),
  status: membershipStatusSchema,
  flatId: uuidSchema,
  flatNumber: z.string(),
  towerName: z.string(),
  communityId: uuidSchema,
  communityName: z.string(),
  verifiedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type Membership = z.infer<typeof membershipSchema>;

// ------------------------------------------------------------- resident side

export const residentMeSchema = z.object({
  id: uuidSchema,
  phone: z.string(),
  fullName: z.string().nullable(),
  email: z.string().nullable(),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  /** The active (PENDING or VERIFIED) membership, if any. */
  membership: membershipSchema.nullable(),
  /** Latest verification outcome for the active or most recent membership. */
  verification: z
    .object({
      decision: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
      reason: z.string().nullable(),
      documentUploaded: z.boolean(),
      /** The flat this verification is for, so a re-submission after rejection can be prefilled. */
      flat: z
        .object({ flatId: uuidSchema, flatNumber: z.string(), towerName: z.string(), communityId: uuidSchema, communityName: z.string(), occupancy: z.enum(['OWNER', 'TENANT', 'FAMILY']) })
        .nullable(),
    })
    .nullable(),
  version: versionSchema,
});
export type ResidentMe = z.infer<typeof residentMeSchema>;

export const updateResidentMeSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  email: z.email().trim().toLowerCase().nullable().optional(),
  version: versionSchema,
});
export type UpdateResidentMeInput = z.infer<typeof updateResidentMeSchema>;

export const registerResidenceSchema = z.object({
  flatId: uuidSchema,
  occupancy: z.enum(['OWNER', 'TENANT']),
  document: z.object({
    docType: residenceDocTypeSchema,
    fileName: z.string().trim().min(1).max(255),
    mimeType: documentMimeSchema,
    sizeBytes: z.number().int().min(1).max(MAX_DOCUMENT_BYTES),
  }),
});
export type RegisterResidenceInput = z.infer<typeof registerResidenceSchema>;

/**
 * POST /v1/resident/residence/document — a fresh upload target for the
 * caller's PENDING registration whose document never finished uploading
 * (e.g. the upload failed or the app closed). 409 once a document is uploaded.
 */
export const replaceResidenceDocumentSchema = registerResidenceSchema.pick({ document: true });
export type ReplaceResidenceDocumentInput = z.infer<typeof replaceResidenceDocumentSchema>;

/** Signed upload target: PUT the file to `uploadUrl` (Supabase Storage signed upload). */
export const signedUploadSchema = z.object({
  documentId: uuidSchema,
  uploadUrl: z.string(),
  token: z.string(),
  path: z.string(),
  expiresInSeconds: z.number().int(),
});
export type SignedUpload = z.infer<typeof signedUploadSchema>;

export const residenceRegistrationResultSchema = z.object({
  membershipId: uuidSchema,
  upload: signedUploadSchema,
});
export type ResidenceRegistrationResult = z.infer<typeof residenceRegistrationResultSchema>;

export const expansionVoteSchema = z.discriminatedUnion('level', [
  z.object({ level: z.literal('CITY'), cityName: z.string().trim().min(2).max(120) }),
  z.object({
    level: z.literal('COMMUNITY'),
    cityId: uuidSchema,
    communityName: z.string().trim().min(2).max(120),
  }),
]);
export type ExpansionVoteInput = z.infer<typeof expansionVoteSchema>;

export const familyRequestSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: indianOrE164PhoneSchema,
  relationship: z.string().trim().min(2).max(40),
});
export type FamilyRequestInput = z.infer<typeof familyRequestSchema>;

export const familyRequestViewSchema = z.object({
  id: uuidSchema,
  fullName: z.string(),
  phone: z.string(),
  relationship: z.string(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']),
  reason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().nullable(),
});
export type FamilyRequestView = z.infer<typeof familyRequestViewSchema>;

export const householdSchema = z.object({
  isPrimary: z.boolean(),
  members: z.array(
    z.object({
      membershipId: uuidSchema,
      residentId: uuidSchema,
      fullName: z.string().nullable(),
      phone: z.string(),
      kind: z.enum(['PRIMARY', 'FAMILY']),
      status: membershipStatusSchema,
    }),
  ),
  requests: z.array(familyRequestViewSchema),
});
export type Household = z.infer<typeof householdSchema>;

/** Catalogue as a resident sees it: only plans priced for their flat's category. */
export const residentCatalogueSchema = z.object({
  communityId: uuidSchema,
  residenceCategory: z.object({ id: uuidSchema, label: z.string() }).nullable(),
  versionNo: z.number().int().nullable(),
  services: z.array(z.object({ serviceId: uuidSchema, code: z.string(), name: z.string(), operatingMode: z.string().nullable() })),
  plans: z.array(
    z.object({
      id: uuidSchema,
      name: z.string(),
      description: z.string().nullable(),
      validityDays: z.number().int(),
      packagePricePaise: z.number().int().nullable(),
      servicePrices: z.array(z.object({ serviceId: uuidSchema, name: z.string(), pricePaise: z.number().int() })),
      components: z.array(
        z.object({
          /** Needed to choose optional add-ons when booking. */
          id: uuidSchema,
          serviceId: uuidSchema,
          name: z.string(),
          isOptionalAddon: z.boolean(),
          visitsPerDay: z.number().int(),
          daysOfWeek: z.number().int(),
          durationMinutes: z.number().int(),
          timeWindow: z.object({ name: z.string(), startTime: z.string(), endTime: z.string() }).nullable(),
          addonHours: z.number().nullable(),
          addonPricePaise: z.number().int().nullable(),
          tasks: z.array(z.object({ name: z.string(), frequency: z.string(), timesPerPeriod: z.number().int() })),
        }),
      ),
    }),
  ),
});
export type ResidentCatalogue = z.infer<typeof residentCatalogueSchema>;

// ---------------------------------------------------------------- admin side

export const adminResidentSchema = z.object({
  id: uuidSchema,
  phone: z.string(),
  fullName: z.string().nullable(),
  email: z.string().nullable(),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  membership: membershipSchema.nullable(),
  createdAt: z.iso.datetime(),
  version: versionSchema,
});
export type AdminResident = z.infer<typeof adminResidentSchema>;

export const adminResidentDetailSchema = adminResidentSchema.extend({
  memberships: z.array(membershipSchema),
  openTickets: z.number().int(),
});
export type AdminResidentDetail = z.infer<typeof adminResidentDetailSchema>;

export const setResidentStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  reason: z.string().trim().min(3).max(500),
  version: versionSchema,
});
export type SetResidentStatusInput = z.infer<typeof setResidentStatusSchema>;

export const verificationRequestSchema = z.object({
  id: uuidSchema,
  decision: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
  reason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().nullable(),
  resident: z.object({ id: uuidSchema, fullName: z.string().nullable(), phone: z.string() }),
  membership: membershipSchema,
  document: z.object({ id: uuidSchema, docType: residenceDocTypeSchema, fileName: z.string(), uploaded: z.boolean() }),
  /** True when this flat already has a verified Primary Resident (approval would be blocked). */
  flatHasPrimary: z.boolean(),
});
export type VerificationRequest = z.infer<typeof verificationRequestSchema>;

export const rejectSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export type RejectInput = z.infer<typeof rejectSchema>;

export const adminFamilyRequestSchema = familyRequestViewSchema.extend({
  primary: z.object({ residentId: uuidSchema, fullName: z.string().nullable(), phone: z.string() }),
  flat: z.object({ flatNumber: z.string(), towerName: z.string(), communityName: z.string() }),
  physicalVerificationAt: z.iso.datetime().nullable(),
});
export type AdminFamilyRequest = z.infer<typeof adminFamilyRequestSchema>;

export const approveFamilySchema = z.object({
  /** Reviewer confirms the in-person verification took place (Final ADM-06). */
  physicalVerificationDone: z.literal(true, { error: 'Confirm that the physical verification was done' }),
  note: z.string().trim().max(500).optional(),
});
export type ApproveFamilyInput = z.infer<typeof approveFamilySchema>;

export const documentUrlSchema = z.object({ url: z.string(), expiresInSeconds: z.number().int() });
export type DocumentUrl = z.infer<typeof documentUrlSchema>;
