import { z } from 'zod';

/** Public website enquiry (WEB-05). Final fields/consent copy are OPEN (OPN-27); these are the minimum. */
export const createEnquirySchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9][0-9]{9}$/, 'Enter a valid 10-digit mobile number'),
  email: z.email().trim().toLowerCase().optional(),
  city: z.string().trim().max(80).optional(),
  community: z.string().trim().max(120).optional(),
  message: z.string().trim().min(5).max(2000),
  consent: z.literal(true, { error: 'Please accept the privacy notice to continue' }),
  /** Honeypot: must be empty. Bots that fill it are silently dropped. */
  website: z.string().max(0).optional(),
});
export type CreateEnquiryInput = z.infer<typeof createEnquirySchema>;

export const enquiryAcceptedSchema = z.object({
  reference: z.string(),
});
export type EnquiryAccepted = z.infer<typeof enquiryAcceptedSchema>;
