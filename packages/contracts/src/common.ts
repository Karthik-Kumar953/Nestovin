import { z } from 'zod';

export const uuidSchema = z.uuid();

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function pageOf<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}

export const recordStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export type RecordStatus = z.infer<typeof recordStatusSchema>;

/** Optimistic-concurrency version carried on editable records. */
export const versionSchema = z.number().int().min(1);

export const nameSchema = z.string().trim().min(1).max(120);

export const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9][A-Za-z0-9 _-]*$/, 'Use letters, numbers, spaces, hyphen or underscore');

/** Latitude/longitude pair used as a community/tower reference point (attendance distance check). */
export const geoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type GeoPoint = z.infer<typeof geoPointSchema>;
