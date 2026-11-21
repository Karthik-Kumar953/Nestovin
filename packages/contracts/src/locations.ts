import { z } from 'zod';
import { codeSchema, geoPointSchema, nameSchema, recordStatusSchema, uuidSchema, versionSchema } from './common';

/*
 * Two separate structures (ADR-001):
 *   Physical:    City -> Community -> Tower/Building -> Flat
 *   Operational: Cluster -> one or more Communities
 * A community belongs to exactly one cluster at a time; moves are kept as history.
 */

// ---- City ------------------------------------------------------------------

export const citySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  state: z.string(),
  status: recordStatusSchema,
  version: versionSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type City = z.infer<typeof citySchema>;

export const createCitySchema = z.object({
  name: nameSchema,
  state: nameSchema,
});
export type CreateCityInput = z.infer<typeof createCitySchema>;

export const updateCitySchema = createCitySchema.partial().extend({
  status: recordStatusSchema.optional(),
  version: versionSchema,
});
export type UpdateCityInput = z.infer<typeof updateCitySchema>;

// ---- Cluster (operational grouping) ----------------------------------------

export const clusterSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  code: z.string(),
  description: z.string().nullable(),
  status: recordStatusSchema,
  communityCount: z.number().int(),
  version: versionSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Cluster = z.infer<typeof clusterSchema>;

export const createClusterSchema = z.object({
  name: nameSchema,
  code: codeSchema,
  description: z.string().trim().max(500).optional(),
});
export type CreateClusterInput = z.infer<typeof createClusterSchema>;

export const updateClusterSchema = createClusterSchema.partial().extend({
  status: recordStatusSchema.optional(),
  version: versionSchema,
});
export type UpdateClusterInput = z.infer<typeof updateClusterSchema>;

// ---- Community -------------------------------------------------------------

/**
 * Lifecycle: DRAFT (created manually) / IMPORTED (via Excel migration)
 * -> CONFIGURED (catalogue + pricing published) -> ACTIVE -> INACTIVE.
 * Only DRAFT/INACTIVE/ACTIVE transitions are reachable in Milestone 1;
 * IMPORTED/CONFIGURED are set by later modules.
 */
export const communityStatusSchema = z.enum(['DRAFT', 'IMPORTED', 'CONFIGURED', 'ACTIVE', 'INACTIVE']);
export type CommunityStatus = z.infer<typeof communityStatusSchema>;

export const communitySchema = z.object({
  id: uuidSchema,
  cityId: uuidSchema,
  cityName: z.string(),
  name: z.string(),
  code: z.string(),
  addressLine: z.string().nullable(),
  postalCode: z.string().nullable(),
  /** Reference point for the attendance distance check (set via Google Maps in the admin). */
  location: geoPointSchema.nullable(),
  /** Attendance check-in radius around `location`, metres (ADM-12). */
  geofenceRadiusM: z.number().int().optional(),
  status: communityStatusSchema,
  clusterId: uuidSchema.nullable(),
  clusterName: z.string().nullable(),
  /**
   * RES-07A: enabled services with their effective booking mode (own mode, else the
   * community default; null when neither is set). Read-only summary for lists.
   */
  bookingModes: z
    .array(z.object({ code: z.string(), name: z.string(), mode: z.enum(['DEMAND_LED', 'CONTINUOUS']).nullable() }))
    .optional(),
  version: versionSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Community = z.infer<typeof communitySchema>;

export const createCommunitySchema = z.object({
  cityId: uuidSchema,
  name: nameSchema,
  code: codeSchema,
  addressLine: z.string().trim().max(300).optional(),
  postalCode: z
    .string()
    .trim()
    .regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit PIN code')
    .optional(),
  location: geoPointSchema.optional(),
  /**
   * Initial cluster. Required for cluster-scoped admins (the community must stay
   * inside their scope); optional for global admins. An unassigned community is
   * visible to global-scope admins only and never inherits anyone's scope.
   */
  clusterId: uuidSchema.optional(),
});
export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;

export const updateCommunitySchema = createCommunitySchema
  .omit({ cityId: true, clusterId: true })
  .partial()
  .extend({
    /** Deactivate only. Activation goes through the Community Setup checklist (POST /communities/:id/activate). */
    status: z.literal('INACTIVE').optional(),
    version: versionSchema,
  });
export type UpdateCommunityInput = z.infer<typeof updateCommunitySchema>;

/** Assign or move a community to a cluster. Closes the current membership and opens a new one. */
export const assignCommunityClusterSchema = z.object({
  clusterId: uuidSchema,
  reason: z.string().trim().min(3).max(500),
});
export type AssignCommunityClusterInput = z.infer<typeof assignCommunityClusterSchema>;

export const clusterMembershipSchema = z.object({
  id: uuidSchema,
  clusterId: uuidSchema,
  clusterName: z.string(),
  communityId: uuidSchema,
  effectiveFrom: z.iso.datetime(),
  effectiveTo: z.iso.datetime().nullable(),
  reason: z.string(),
  changedBy: uuidSchema,
});
export type ClusterMembership = z.infer<typeof clusterMembershipSchema>;

/** GET /clusters/:id/communities — a current member of the cluster (ADM-03). */
export const clusterCommunityMemberSchema = z.object({
  communityId: uuidSchema,
  name: z.string(),
  code: z.string(),
  cityId: uuidSchema,
  cityName: z.string(),
  status: communityStatusSchema,
  /** Active towers / active flats. */
  towerCount: z.number().int(),
  flatCount: z.number().int(),
  /** Start of the current membership. */
  since: z.iso.datetime(),
  reason: z.string(),
});
export type ClusterCommunityMember = z.infer<typeof clusterCommunityMemberSchema>;

/**
 * POST /clusters/:id/communities — assign or move several communities into this
 * cluster in one transaction. Communities already in the cluster are skipped.
 */
export const assignClusterCommunitiesSchema = z.object({
  communityIds: z.array(uuidSchema).min(1).max(200),
  reason: z.string().trim().min(3).max(500),
});
export type AssignClusterCommunitiesInput = z.infer<typeof assignClusterCommunitiesSchema>;

export const clusterAssignmentOutcomeSchema = z.enum(['ASSIGNED', 'MOVED', 'ALREADY_IN_CLUSTER']);
export type ClusterAssignmentOutcome = z.infer<typeof clusterAssignmentOutcomeSchema>;

export const assignClusterCommunitiesResultSchema = z.object({
  clusterId: uuidSchema,
  assigned: z.number().int(),
  moved: z.number().int(),
  skipped: z.number().int(),
  results: z.array(
    z.object({
      communityId: uuidSchema,
      communityName: z.string(),
      /** ASSIGNED = had no cluster; MOVED = left another cluster; ALREADY_IN_CLUSTER = unchanged. */
      outcome: clusterAssignmentOutcomeSchema,
      fromClusterId: uuidSchema.nullable(),
      fromClusterName: z.string().nullable(),
    }),
  ),
});
export type AssignClusterCommunitiesResult = z.infer<typeof assignClusterCommunitiesResultSchema>;

/** Query for GET /communities (dropdowns and the master-data table). */
export const communityListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).optional(),
  q: z.string().trim().max(100).optional(),
  status: z.string().max(20).optional(),
  cityId: uuidSchema.optional(),
  clusterId: uuidSchema.optional(),
  /** true = only communities with no current cluster (global-scope admins only; others get an empty list). */
  unassigned: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});
export type CommunityListQuery = z.infer<typeof communityListQuerySchema>;

// ---- Tower / Building ------------------------------------------------------

export const towerSchema = z.object({
  id: uuidSchema,
  communityId: uuidSchema,
  name: z.string(),
  floorCount: z.number().int().nullable(),
  location: geoPointSchema.nullable(),
  status: recordStatusSchema,
  flatCount: z.number().int(),
  version: versionSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Tower = z.infer<typeof towerSchema>;

export const createTowerSchema = z.object({
  communityId: uuidSchema,
  name: z.string().trim().min(1).max(60),
  floorCount: z.number().int().min(0).max(200).optional(),
  location: geoPointSchema.optional(),
});
export type CreateTowerInput = z.infer<typeof createTowerSchema>;

export const updateTowerSchema = createTowerSchema
  .omit({ communityId: true })
  .partial()
  .extend({ status: recordStatusSchema.optional(), version: versionSchema });
export type UpdateTowerInput = z.infer<typeof updateTowerSchema>;

// ---- Flat ------------------------------------------------------------------

export const flatSchema = z.object({
  id: uuidSchema,
  towerId: uuidSchema,
  towerName: z.string(),
  communityId: uuidSchema,
  floor: z.number().int().nullable(),
  flatNumber: z.string(),
  /** Free-text classification from migration (e.g. "2 BHK", "Villa 4 BHK"). Residence categories for pricing arrive in Phase 2. */
  bhkType: z.string().nullable(),
  areaSqft: z.number().nullable(),
  residenceCategoryId: uuidSchema.nullable(),
  residenceCategoryLabel: z.string().nullable(),
  occupancy: z.enum(['OWNER', 'TENANT', 'VACANT']).nullable(),
  status: recordStatusSchema,
  version: versionSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Flat = z.infer<typeof flatSchema>;

export const createFlatSchema = z.object({
  towerId: uuidSchema,
  flatNumber: z.string().trim().min(1).max(20),
  floor: z.number().int().min(-5).max(200).optional(),
  bhkType: z.string().trim().max(40).optional(),
  areaSqft: z.number().positive().max(100000).optional(),
  residenceCategoryId: uuidSchema.nullable().optional(),
  occupancy: z.enum(['OWNER', 'TENANT', 'VACANT']).nullable().optional(),
});
export type CreateFlatInput = z.infer<typeof createFlatSchema>;

export const updateFlatSchema = createFlatSchema
  .omit({ towerId: true })
  .partial()
  .extend({ status: recordStatusSchema.optional(), version: versionSchema });
export type UpdateFlatInput = z.infer<typeof updateFlatSchema>;

// ---- Expansion votes (read-only aggregate in M1) ---------------------------

export const expansionVoteAggregateSchema = z.object({
  level: z.enum(['CITY', 'COMMUNITY']),
  cityName: z.string(),
  communityName: z.string().nullable(),
  voteCount: z.number().int(),
  firstVoteAt: z.iso.datetime(),
  lastVoteAt: z.iso.datetime(),
});
export type ExpansionVoteAggregate = z.infer<typeof expansionVoteAggregateSchema>;

/** GET /expansion-votes filters and sort (Super Admin only). */
export const expansionVoteQuerySchema = z.object({
  level: z.enum(['CITY', 'COMMUNITY']).optional(),
  /** City name contains (case-insensitive). */
  city: z.string().trim().min(1).max(100).optional(),
  /** City or community name contains (case-insensitive). */
  q: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(['votes', 'recent', 'oldest', 'name']).default('votes'),
  limit: z.coerce.number().int().min(1).max(500).default(500),
});
export type ExpansionVoteQuery = z.infer<typeof expansionVoteQuerySchema>;
