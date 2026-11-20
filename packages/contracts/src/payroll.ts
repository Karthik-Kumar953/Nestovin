import { z } from 'zod';
import { uuidSchema } from './common';

/*
 * Phase 8: ADM-14 finance overview and basic payroll (ADR-007, ADR-014).
 * Fixed monthly salary, prorated by calendar days. Rules not yet approved are
 * flagged, never guessed. Approval does not mean paid.
 */

const isoDate = z.iso.date();
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');

export const compensationSchema = z.object({
  id: uuidSchema,
  type: z.literal('FIXED_MONTHLY'),
  monthlyAmountPaise: z.number().int(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  createdAt: z.string(),
});
export type Compensation = z.infer<typeof compensationSchema>;

export const setCompensationSchema = z.object({
  monthlyAmountPaise: z.number().int().positive().max(100_000_000_00),
  effectiveFrom: isoDate,
});
export type SetCompensationInput = z.infer<typeof setCompensationSchema>;

export const payrollRunStatusSchema = z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'RETURNED']);
export const paymentStatusSchema = z.enum(['PENDING', 'PARTIALLY_PAID', 'PAID', 'NOT_PAYABLE']);

export const payrollRunSummarySchema = z.object({
  id: uuidSchema,
  month: z.string(),
  version: z.number().int(),
  status: payrollRunStatusSchema,
  employees: z.number().int(),
  flagged: z.number().int(),
  netPaise: z.number().int(),
  paidPaise: z.number().int(),
  preparedAt: z.string(),
  reviewedAt: z.string().nullable(),
  returnReason: z.string().nullable(),
});
export type PayrollRunSummary = z.infer<typeof payrollRunSummarySchema>;

export const payrollLineSchema = z.object({
  id: uuidSchema,
  employee: z.object({ id: uuidSchema, employeeCode: z.string(), fullName: z.string() }),
  daysInMonth: z.number().int(),
  payableDays: z.number().int(),
  compensation: z.array(z.object({ monthlyAmountPaise: z.number().int(), from: z.string(), to: z.string(), days: z.number().int() })),
  attendance: z.object({
    completedVisits: z.number().int(),
    workerNoShows: z.number().int(),
    residentNoShows: z.number().int(),
    approvedLeaveDays: z.number().int(),
    pendingCorrections: z.number().int(),
  }),
  items: z.array(
    z.object({ id: uuidSchema, kind: z.enum(['EARNING', 'DEDUCTION']), component: z.string(), amountPaise: z.number().int(), sourceType: z.string(), note: z.string().nullable() }),
  ),
  earningsPaise: z.number().int(),
  deductionsPaise: z.number().int(),
  netPaise: z.number().int(),
  flags: z.array(z.string()),
  paidPaise: z.number().int(),
  paymentStatus: paymentStatusSchema,
  payments: z.array(
    z.object({ id: uuidSchema, amountPaise: z.number().int(), paidOn: z.string(), method: z.string(), reference: z.string().nullable(), reversesPaymentId: z.string().nullable(), note: z.string().nullable() }),
  ),
});
export type PayrollLine = z.infer<typeof payrollLineSchema>;

export const payrollRunDetailSchema = payrollRunSummarySchema.extend({ lines: z.array(payrollLineSchema) });
export type PayrollRunDetail = z.infer<typeof payrollRunDetailSchema>;

export const createPayrollRunSchema = z.object({ month });
export const addLineItemSchema = z.object({
  kind: z.enum(['EARNING', 'DEDUCTION']),
  component: z.enum(['ALLOWANCE', 'INCENTIVE', 'APPROVED_OVERTIME', 'ABSENCE_DEDUCTION', 'OTHER_DEDUCTION', 'OTHER_EARNING']),
  amountPaise: z.number().int().positive(),
  note: z.string().trim().min(3).max(500),
});
export type AddLineItemInput = z.infer<typeof addLineItemSchema>;
export const returnRunSchema = z.object({ reason: z.string().trim().min(3).max(500) });

export const recordSalaryPaymentSchema = z.object({
  amountPaise: z.number().int().positive(),
  paidOn: isoDate,
  method: z.enum(['BANK_TRANSFER', 'UPI', 'CHEQUE', 'CASH']),
  reference: z.string().trim().min(3).max(80).optional(),
  note: z.string().trim().max(500).optional(),
});
export type RecordSalaryPaymentInput = z.infer<typeof recordSalaryPaymentSchema>;
export const reverseSalaryPaymentSchema = z.object({ reason: z.string().trim().min(3).max(500) });

export const financeSummarySchema = z.object({
  months: z.array(
    z.object({
      month: z.string(),
      collectedPaise: z.number().int(),
      refundedPaise: z.number().int(),
      salaryPaidPaise: z.number().int(),
      bookingsConfirmed: z.number().int(),
    }),
  ),
});
export type FinanceSummary = z.infer<typeof financeSummarySchema>;

export const payslipSchema = z.object({
  month: z.string(),
  payableDays: z.number().int(),
  daysInMonth: z.number().int(),
  earningsPaise: z.number().int(),
  deductionsPaise: z.number().int(),
  netPaise: z.number().int(),
  paidPaise: z.number().int(),
  paymentStatus: paymentStatusSchema,
});
export type Payslip = z.infer<typeof payslipSchema>;
