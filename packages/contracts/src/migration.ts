import { z } from 'zod';
import { uuidSchema } from './common';

/*
 * Community migration from Excel (ADM-04, ADR-011).
 * Structure only: no resident personal data. All-or-nothing commit.
 */

/** Exact header row of the approved template (order matters). */
export const IMPORT_COLUMNS = [
  'Tower',
  'Floor',
  'Flat number',
  'BHK type',
  'Area (sq ft)',
  'Residence category',
  'Occupancy',
] as const;

export const IMPORT_OCCUPANCY_VALUES = ['Owner', 'Tenant', 'Vacant'] as const;

export const IMPORT_LIMITS = { maxBytes: 5 * 1024 * 1024, maxRows: 20_000 } as const;

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const importBatchStatusSchema = z.enum(['VALIDATED', 'INVALID', 'APPROVED', 'REJECTED', 'COMMITTED', 'CANCELLED']);
export type ImportBatchStatus = z.infer<typeof importBatchStatusSchema>;

export const importBatchSchema = z.object({
  id: uuidSchema,
  communityId: uuidSchema,
  fileName: z.string(),
  status: importBatchStatusSchema,
  totalRows: z.number().int(),
  validRows: z.number().int(),
  errorRows: z.number().int(),
  warningRows: z.number().int(),
  towersNew: z.number().int(),
  flatsNew: z.number().int(),
  flatsUpdated: z.number().int(),
  fileErrors: z.array(z.string()),
  uploadedBy: uuidSchema,
  uploadedAt: z.iso.datetime(),
  decidedBy: uuidSchema.nullable(),
  decidedAt: z.iso.datetime().nullable(),
  decisionReason: z.string().nullable(),
  committedAt: z.iso.datetime().nullable(),
});
export type ImportBatch = z.infer<typeof importBatchSchema>;

export const importRowSchema = z.object({
  rowNumber: z.number().int(),
  raw: z.record(z.string(), z.unknown()),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  action: z.enum(['CREATE', 'UPDATE', 'UNCHANGED']).nullable(),
});
export type ImportRow = z.infer<typeof importRowSchema>;

export const importDecisionSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type ImportDecisionInput = z.infer<typeof importDecisionSchema>;
