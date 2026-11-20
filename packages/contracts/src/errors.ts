import { z } from 'zod';

/** Machine-readable error codes returned by the API. */
export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'MFA_REQUIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'CONFLICT',
  'VERSION_CONFLICT',
  'RATE_LIMITED',
  'BUSINESS_RULE_VIOLATION',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const fieldErrorSchema = z.object({
  path: z.string(),
  message: z.string(),
});
export type FieldError = z.infer<typeof fieldErrorSchema>;

/**
 * Every non-2xx response uses this envelope. Errors never reveal whether a
 * record outside the caller's scope exists (out-of-scope = NOT_FOUND).
 */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    fields: z.array(fieldErrorSchema).optional(),
    requestId: z.string(),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
