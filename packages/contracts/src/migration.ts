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

/** One structure row entered in the dashboard table (same fields as the Excel template). */
export const gridRowSchema = z.object({
  tower: z.string().max(60).default(''),
  floor: z.union([z.number(), z.string().max(10)]).nullable().optional(),
  flatNumber: z.string().max(20).default(''),
  bhkType: z.string().max(40).nullable().optional(),
  areaSqft: z.union([z.number(), z.string().max(20)]).nullable().optional(),
  category: z.string().max(80).default(''),
  occupancy: z.string().max(20).nullable().optional(),
});
export type GridRow = z.infer<typeof gridRowSchema>;
export const gridImportSchema = z.object({ rows: z.array(gridRowSchema).min(1).max(20_000) });
export type GridImportInput = z.infer<typeof gridImportSchema>;
export const gridValidationSchema = z.object({
  rows: z.array(
    z.object({ rowNumber: z.number().int(), errors: z.array(z.string()), warnings: z.array(z.string()), action: z.enum(['CREATE', 'UPDATE', 'UNCHANGED']).nullable() }),
  ),
  counts: z.object({ valid: z.number().int(), errors: z.number().int(), warnings: z.number().int(), flatsNew: z.number().int(), flatsUpdated: z.number().int(), towersNew: z.number().int() }),
});
export type GridValidation = z.infer<typeof gridValidationSchema>;

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const importBatchStatusSchema = z.enum(['VALIDATED', 'INVALID', 'APPROVED', 'REJECTED', 'COMMITTED', 'CANCELLED']);
export type ImportBatchStatus = z.infer<typeof importBatchStatusSchema>;

export const importBatchSchema = z.object({
  id: uuidSchema,
  communityId: uuidSchema,
  fileName: z.string(),
  source: z.enum(['EXCEL', 'DASHBOARD']),
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

/**
 * GET /import-batches/:id/rows query. Page with `afterRow` (keyset, from
 * `nextAfterRow`) or `offset` (jump to a page). `status` filters rows:
 * error = has errors; warning = warnings but no errors; ok = neither;
 * problem = errors or warnings; all = every row. When `status` is omitted the
 * older `onlyProblems` flag applies (default true = problem).
 */
export const importRowsQuerySchema = z.object({
  status: z.enum(['all', 'error', 'warning', 'ok', 'problem']).optional(),
  onlyProblems: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  afterRow: z.coerce.number().int().min(1).optional(),
  offset: z.coerce.number().int().min(0).max(IMPORT_LIMITS.maxRows).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type ImportRowsQuery = z.infer<typeof importRowsQuerySchema>;

export const importRowsPageSchema = z.object({
  items: z.array(importRowSchema),
  /** Pass as `afterRow` for the next page; null on the last page. */
  nextAfterRow: z.number().int().nullable(),
  /** Rows matching the filter (whole batch), for page counts. */
  total: z.number().int(),
});
export type ImportRowsPage = z.infer<typeof importRowsPageSchema>;

export const importDecisionSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type ImportDecisionInput = z.infer<typeof importDecisionSchema>;
