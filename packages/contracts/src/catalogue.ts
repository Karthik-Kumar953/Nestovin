import { z } from 'zod';
import { recordStatusSchema, uuidSchema, versionSchema } from './common';

/*
 * Per-community catalogue & pricing (ADM-07, ADR-009).
 * Money is integer paise. A missing price cell means "not offered".
 */

export const SERVICE_CODES = ['MAID', 'COOK', 'CARETAKER'] as const;
export const serviceCodeSchema = z.enum(SERVICE_CODES);
export type ServiceCode = z.infer<typeof serviceCodeSchema>;

export const operatingModeSchema = z.enum(['DEMAND_LED', 'CONTINUOUS']);
export type OperatingMode = z.infer<typeof operatingModeSchema>;

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time, e.g. 07:00');
const MAX_PAISE = 1_000_000_000; // ₹1 crore
const paise = z.number().int().min(1).max(MAX_PAISE);
const code = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9][A-Za-z0-9 _.-]*$/, 'Use letters, numbers, spaces, dot, hyphen or underscore');

// ---------------------------------------------------------------- services

export const serviceSchema = z.object({ id: uuidSchema, code: serviceCodeSchema, name: z.string() });
export type Service = z.infer<typeof serviceSchema>;

export const communityServiceSettingSchema = z.object({
  serviceId: uuidSchema,
  code: serviceCodeSchema,
  name: z.string(),
  enabled: z.boolean(),
  /** null = use the community default. */
  operatingMode: operatingModeSchema.nullable(),
  effectiveMode: operatingModeSchema.nullable(),
});
export type CommunityServiceSetting = z.infer<typeof communityServiceSettingSchema>;

export const communityServicesSchema = z.object({
  defaultOperatingMode: operatingModeSchema.nullable(),
  services: z.array(communityServiceSettingSchema),
});
export type CommunityServices = z.infer<typeof communityServicesSchema>;

export const updateCommunityServicesSchema = z.object({
  defaultOperatingMode: operatingModeSchema.nullable(),
  services: z
    .array(z.object({ serviceId: uuidSchema, enabled: z.boolean(), operatingMode: operatingModeSchema.nullable() }))
    .max(3),
});
export type UpdateCommunityServicesInput = z.infer<typeof updateCommunityServicesSchema>;

// ------------------------------------------------------ residence categories

export const residenceCategorySchema = z.object({
  id: uuidSchema,
  communityId: uuidSchema,
  code: z.string(),
  label: z.string(),
  sort: z.number().int(),
  status: recordStatusSchema,
  flatCount: z.number().int(),
  version: versionSchema,
});
export type ResidenceCategory = z.infer<typeof residenceCategorySchema>;

export const createResidenceCategorySchema = z.object({
  code,
  label: z.string().trim().min(1).max(80),
  sort: z.number().int().min(0).max(999).optional(),
});
export type CreateResidenceCategoryInput = z.infer<typeof createResidenceCategorySchema>;

export const updateResidenceCategorySchema = createResidenceCategorySchema
  .partial()
  .extend({ status: recordStatusSchema.optional(), version: versionSchema });
export type UpdateResidenceCategoryInput = z.infer<typeof updateResidenceCategorySchema>;

// ------------------------------------------------------------- time windows

export const timeWindowSchema = z.object({
  id: uuidSchema,
  communityId: uuidSchema,
  name: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  status: recordStatusSchema,
  version: versionSchema,
});
export type TimeWindow = z.infer<typeof timeWindowSchema>;

export const createTimeWindowSchema = z
  .object({ name: z.string().trim().min(1).max(60), startTime: timeOfDay, endTime: timeOfDay })
  .refine((v) => v.endTime > v.startTime, { message: 'End time must be after start time', path: ['endTime'] });
export type CreateTimeWindowInput = z.infer<typeof createTimeWindowSchema>;

export const updateTimeWindowSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  startTime: timeOfDay.optional(),
  endTime: timeOfDay.optional(),
  status: recordStatusSchema.optional(),
  version: versionSchema,
});
export type UpdateTimeWindowInput = z.infer<typeof updateTimeWindowSchema>;

// -------------------------------------------------------------------- tasks

export const serviceTaskSchema = z.object({
  id: uuidSchema,
  communityId: uuidSchema,
  serviceId: uuidSchema,
  serviceCode: serviceCodeSchema,
  name: z.string(),
  description: z.string().nullable(),
  defaultDurationMin: z.number().int().nullable(),
  status: recordStatusSchema,
  version: versionSchema,
});
export type ServiceTask = z.infer<typeof serviceTaskSchema>;

export const createServiceTaskSchema = z.object({
  serviceId: uuidSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  defaultDurationMin: z.number().int().min(1).max(720).optional(),
});
export type CreateServiceTaskInput = z.infer<typeof createServiceTaskSchema>;

export const updateServiceTaskSchema = createServiceTaskSchema
  .omit({ serviceId: true })
  .partial()
  .extend({ status: recordStatusSchema.optional(), version: versionSchema });
export type UpdateServiceTaskInput = z.infer<typeof updateServiceTaskSchema>;

// -------------------------------------------------------- catalogue versions

export const catalogueStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'SUPERSEDED']);

export const catalogueVersionSummarySchema = z.object({
  id: uuidSchema,
  communityId: uuidSchema,
  versionNo: z.number().int(),
  status: catalogueStatusSchema,
  effectiveFrom: z.string().nullable(),
  notes: z.string().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  planCount: z.number().int(),
  version: versionSchema,
});
export type CatalogueVersionSummary = z.infer<typeof catalogueVersionSummarySchema>;

export const taskFrequencySchema = z.enum(['PER_VISIT', 'DAILY', 'WEEKLY', 'MONTHLY']);
export type TaskFrequency = z.infer<typeof taskFrequencySchema>;

export const planComponentTaskSchema = z.object({
  serviceTaskId: uuidSchema,
  frequency: taskFrequencySchema,
  timesPerPeriod: z.number().int().min(1).max(31),
});

export const planComponentSchema = z.object({
  id: uuidSchema,
  planId: uuidSchema,
  serviceId: uuidSchema,
  serviceCode: serviceCodeSchema,
  isOptionalAddon: z.boolean(),
  visitsPerDay: z.number().int(),
  /** Bitmask Mon=1 … Sun=64. */
  daysOfWeek: z.number().int(),
  durationMinutes: z.number().int(),
  timeWindowId: uuidSchema.nullable(),
  addonHours: z.number().nullable(),
  tasks: z.array(planComponentTaskSchema),
});
export type PlanComponent = z.infer<typeof planComponentSchema>;

export const planSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  validityDays: z.number().int(),
  sort: z.number().int(),
  components: z.array(planComponentSchema),
});
export type Plan = z.infer<typeof planSchema>;

export const priceBasisSchema = z.enum(['PACKAGE', 'SERVICE']);
export type PriceBasis = z.infer<typeof priceBasisSchema>;

export const priceCellSchema = z
  .object({
    planId: uuidSchema,
    residenceCategoryId: uuidSchema,
    priceBasis: priceBasisSchema,
    serviceId: uuidSchema.nullable(),
    amountPaise: paise,
  })
  .refine((c) => (c.priceBasis === 'PACKAGE') === (c.serviceId === null), {
    message: 'Package prices have no service; service prices need one',
  });
export type PriceCell = z.infer<typeof priceCellSchema>;

export const addonPriceCellSchema = z.object({
  planComponentId: uuidSchema,
  residenceCategoryId: uuidSchema,
  /** 0 = included in the package. */
  amountPaise: z.number().int().min(0).max(MAX_PAISE),
});
export type AddonPriceCell = z.infer<typeof addonPriceCellSchema>;

export const catalogueVersionDetailSchema = catalogueVersionSummarySchema.extend({
  plans: z.array(planSchema),
  prices: z.array(priceCellSchema),
  addonPrices: z.array(addonPriceCellSchema),
});
export type CatalogueVersionDetail = z.infer<typeof catalogueVersionDetailSchema>;

export const createDraftSchema = z.object({
  /** Start from the community's currently published version (recommended when editing prices). */
  copyFromPublished: z.boolean().default(true),
  notes: z.string().trim().max(500).optional(),
});
export type CreateDraftInput = z.infer<typeof createDraftSchema>;

export const upsertPlanSchema = z.object({
  code,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000).optional(),
  validityDays: z.number().int().min(1).max(366),
  sort: z.number().int().min(0).max(999).optional(),
});
export type UpsertPlanInput = z.infer<typeof upsertPlanSchema>;

export const upsertComponentSchema = z
  .object({
    serviceId: uuidSchema,
    isOptionalAddon: z.boolean().default(false),
    visitsPerDay: z.number().int().min(1).max(6).default(1),
    daysOfWeek: z.number().int().min(1).max(127).default(127),
    durationMinutes: z.number().int().min(15).max(1440),
    timeWindowId: uuidSchema.nullable().optional(),
    addonHours: z.number().positive().max(24).nullable().optional(),
    tasks: z.array(planComponentTaskSchema).max(100).default([]),
  })
  .refine((c) => new Set(c.tasks.map((t) => t.serviceTaskId)).size === c.tasks.length, {
    message: 'A task is listed twice',
    path: ['tasks'],
  });
export type UpsertComponentInput = z.infer<typeof upsertComponentSchema>;

export const putPriceMatrixSchema = z.object({
  cells: z.array(priceCellSchema).max(5000),
  addonCells: z.array(addonPriceCellSchema).max(5000),
});
export type PutPriceMatrixInput = z.infer<typeof putPriceMatrixSchema>;

export const catalogueIssueSchema = z.object({
  severity: z.enum(['ERROR', 'WARNING']),
  code: z.string(),
  message: z.string(),
  planId: uuidSchema.optional(),
});
export type CatalogueIssue = z.infer<typeof catalogueIssueSchema>;

export const catalogueValidationSchema = z.object({
  publishable: z.boolean(),
  issues: z.array(catalogueIssueSchema),
});
export type CatalogueValidation = z.infer<typeof catalogueValidationSchema>;

export const publishCatalogueSchema = z.object({
  effectiveFrom: z.iso.date().optional(),
  notes: z.string().trim().max(500).optional(),
});
export type PublishCatalogueInput = z.infer<typeof publishCatalogueSchema>;

// --------------------------------------------------------------- activation

export const activationChecklistSchema = z.object({
  ready: z.boolean(),
  checks: z.array(z.object({ key: z.string(), label: z.string(), ok: z.boolean(), detail: z.string().optional() })),
});
export type ActivationChecklist = z.infer<typeof activationChecklistSchema>;

/** Days-of-week bitmask helpers (Mon=1 … Sun=64). */
export const WEEKDAYS = [
  { bit: 1, short: 'Mon' },
  { bit: 2, short: 'Tue' },
  { bit: 4, short: 'Wed' },
  { bit: 8, short: 'Thu' },
  { bit: 16, short: 'Fri' },
  { bit: 32, short: 'Sat' },
  { bit: 64, short: 'Sun' },
] as const;
