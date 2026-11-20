import type { ColumnType, Generated } from 'kysely';

/*
 * Kysely table types for the `app` schema (Milestone 1 tables).
 * Hand-written for now; replace with generated types (kysely-codegen) once the
 * local database is part of the dev loop. Must mirror supabase/migrations.
 */

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type Stamped = {
  version: Generated<number>;
  created_at: Generated<Date>;
  created_by: string | null;
  updated_at: Generated<Date>;
  updated_by: string | null;
};
/** numeric columns come back from pg as strings. */
type Numeric = ColumnType<string, number | string, number | string>;

export interface CitiesTable extends Stamped {
  id: Generated<string>;
  name: string;
  state: string;
  status: Generated<'ACTIVE' | 'INACTIVE'>;
}

export interface ClustersTable extends Stamped {
  id: Generated<string>;
  name: string;
  code: string;
  description: string | null;
  status: Generated<'ACTIVE' | 'INACTIVE'>;
}

export interface CommunitiesTable extends Stamped {
  id: Generated<string>;
  city_id: string;
  name: string;
  code: string;
  address_line: string | null;
  postal_code: string | null;
  location_lat: Numeric | null;
  location_lng: Numeric | null;
  status: Generated<'DRAFT' | 'IMPORTED' | 'CONFIGURED' | 'ACTIVE' | 'INACTIVE'>;
  default_operating_mode: 'DEMAND_LED' | 'CONTINUOUS' | null;
  timezone: Generated<string>;
}

export interface ClusterCommunityMembershipsTable {
  id: Generated<string>;
  cluster_id: string;
  community_id: string;
  effective_from: Generated<Date>;
  effective_to: Timestamp | null;
  reason: string;
  changed_by: string | null;
}

export interface TowersTable extends Stamped {
  id: Generated<string>;
  community_id: string;
  name: string;
  floor_count: number | null;
  location_lat: Numeric | null;
  location_lng: Numeric | null;
  status: Generated<'ACTIVE' | 'INACTIVE'>;
}

export interface FlatsTable extends Stamped {
  id: Generated<string>;
  tower_id: string;
  /** Set by trigger from the tower. */
  community_id: ColumnType<string, string | undefined, string | undefined>;
  floor: number | null;
  flat_number: string;
  bhk_type: string | null;
  area_sqft: Numeric | null;
  status: Generated<'ACTIVE' | 'INACTIVE'>;
  residence_category_id: string | null;
  occupancy: 'OWNER' | 'TENANT' | 'VACANT' | null;
}

export interface ExpansionVotesTable {
  id: Generated<string>;
  resident_user_id: string;
  level: 'CITY' | 'COMMUNITY';
  city_id: string | null;
  city_name: string;
  community_name: string | null;
  created_at: Generated<Date>;
}

export interface PermissionModulesTable {
  key: string;
  ref: string;
  label: string;
  grantable: boolean;
}
export interface PermissionActionsTable {
  key: string;
}
export interface PermissionModuleActionsTable {
  module_key: string;
  action_key: string;
}

export interface AdminProfilesTable extends Stamped {
  id: string;
  email: string;
  full_name: string;
  title: string | null;
  is_super_admin: Generated<boolean>;
  status: Generated<'INVITED' | 'ACTIVE' | 'DISABLED'>;
  scope_type: Generated<'GLOBAL' | 'CLUSTERS'>;
  last_sign_in_at: Timestamp | null;
}

export interface RolesTable extends Stamped {
  id: Generated<string>;
  name: string;
  description: string | null;
}

export interface RoleGrantsTable {
  role_id: string;
  module_key: string;
  action_key: string;
}

export interface AdminRoleAssignmentsTable {
  admin_id: string;
  role_id: string;
  assigned_at: Generated<Date>;
  assigned_by: string | null;
}

export interface AdminExtraGrantsTable {
  admin_id: string;
  module_key: string;
  action_key: string;
  granted_at: Generated<Date>;
  granted_by: string | null;
}

export interface AdminClusterScopesTable {
  admin_id: string;
  cluster_id: string;
  granted_at: Generated<Date>;
  granted_by: string | null;
}

export interface AdminEffectiveGrantsView {
  admin_id: string;
  module_key: string;
  action_key: string;
  source: string;
}

export interface AuditEventsTable {
  id: Generated<string>;
  occurred_at: Generated<Date>;
  actor_id: string | null;
  actor_kind: 'admin' | 'resident' | 'employee' | 'system' | 'public';
  action: string;
  target_type: string;
  target_id: string | null;
  request_id: string | null;
  reason: string | null;
  before_data: unknown;
  after_data: unknown;
}

export interface WebsiteEnquiriesTable {
  id: Generated<string>;
  reference: Generated<string>;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  community: string | null;
  message: string;
  consent_at: Timestamp;
  source_ip_hash: string | null;
  user_agent: string | null;
  status: Generated<'NEW' | 'IN_PROGRESS' | 'CLOSED'>;
  routing_status: Generated<'PENDING' | 'ROUTED' | 'FAILED'>;
  routed_at: Timestamp | null;
  created_at: Generated<Date>;
}

export interface NotificationOutboxTable {
  id: Generated<string>;
  event_type: string;
  dedupe_key: string;
  channel: 'EMAIL' | 'SMS' | 'PUSH';
  recipient: string;
  payload: unknown;
  status: Generated<'PENDING' | 'SENT' | 'FAILED' | 'DEAD'>;
  attempts: Generated<number>;
  next_attempt_at: Generated<Date>;
  last_error: string | null;
  created_at: Generated<Date>;
  sent_at: Timestamp | null;
}

// ------------------------------------------------------------- Phase 2

type RecStatus = Generated<'ACTIVE' | 'INACTIVE'>;
type Mode = 'DEMAND_LED' | 'CONTINUOUS';

export interface ServicesTable {
  id: Generated<string>;
  code: 'MAID' | 'COOK' | 'CARETAKER';
  name: string;
  sort: number;
}

export interface CommunityServicesTable extends Stamped {
  community_id: string;
  service_id: string;
  enabled: Generated<boolean>;
  operating_mode: Mode | null;
}

export interface ResidenceCategoriesTable extends Stamped {
  id: Generated<string>;
  community_id: string;
  code: string;
  label: string;
  sort: Generated<number>;
  status: RecStatus;
}

export interface TimeWindowsTable extends Stamped {
  id: Generated<string>;
  community_id: string;
  name: string;
  start_time: string;
  end_time: string;
  status: RecStatus;
}

export interface ServiceTasksTable extends Stamped {
  id: Generated<string>;
  community_id: string;
  service_id: string;
  name: string;
  description: string | null;
  default_duration_min: number | null;
  status: RecStatus;
}

export interface CatalogueVersionsTable extends Stamped {
  id: Generated<string>;
  community_id: string;
  version_no: number;
  status: Generated<'DRAFT' | 'PUBLISHED' | 'SUPERSEDED'>;
  effective_from: ColumnType<string | null, string | null | undefined, string | null>;
  notes: string | null;
  published_at: Timestamp | null;
  published_by: string | null;
}

export interface PlansTable {
  id: Generated<string>;
  catalogue_version_id: string;
  code: string;
  name: string;
  description: string | null;
  validity_days: number;
  sort: Generated<number>;
}

export interface PlanComponentsTable {
  id: Generated<string>;
  plan_id: string;
  service_id: string;
  is_optional_addon: Generated<boolean>;
  visits_per_day: Generated<number>;
  days_of_week: Generated<number>;
  duration_minutes: number;
  time_window_id: string | null;
  addon_hours: Numeric | null;
  sort: Generated<number>;
}

export interface PlanComponentTasksTable {
  plan_component_id: string;
  service_task_id: string;
  frequency: 'PER_VISIT' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
  times_per_period: Generated<number>;
}

/** bigint money comes back from pg as a string (INT8 parser keeps strings). */
type Money = ColumnType<string, number | string, number | string>;

export interface PlanPricesTable {
  id: Generated<string>;
  catalogue_version_id: string;
  plan_id: string;
  residence_category_id: string;
  price_basis: 'PACKAGE' | 'SERVICE';
  service_id: string | null;
  amount_paise: Money;
  currency: Generated<string>;
}

export interface PlanComponentPricesTable {
  plan_component_id: string;
  residence_category_id: string;
  amount_paise: Money;
  currency: Generated<string>;
}

export interface ImportBatchesTable {
  id: Generated<string>;
  community_id: string;
  file_name: string;
  file_sha256: string;
  file_size_bytes: number;
  status: Generated<'VALIDATED' | 'INVALID' | 'APPROVED' | 'REJECTED' | 'COMMITTED' | 'CANCELLED'>;
  total_rows: Generated<number>;
  valid_rows: Generated<number>;
  error_rows: Generated<number>;
  warning_rows: Generated<number>;
  towers_new: Generated<number>;
  flats_new: Generated<number>;
  flats_updated: Generated<number>;
  file_errors: Generated<string[]>;
  uploaded_by: string;
  uploaded_at: Generated<Date>;
  decided_by: string | null;
  decided_at: Timestamp | null;
  decision_reason: string | null;
  committed_by: string | null;
  committed_at: Timestamp | null;
  supersedes_batch_id: string | null;
}

export interface ImportRowsTable {
  batch_id: string;
  row_number: number;
  raw: ColumnType<Record<string, unknown>, string, string>;
  normalized: ColumnType<Record<string, unknown> | null, string | null, string | null>;
  errors: Generated<string[]>;
  warnings: Generated<string[]>;
  action: 'CREATE' | 'UPDATE' | 'UNCHANGED' | null;
}

export interface DB {
  'app.services': ServicesTable;
  'app.community_services': CommunityServicesTable;
  'app.residence_categories': ResidenceCategoriesTable;
  'app.time_windows': TimeWindowsTable;
  'app.service_tasks': ServiceTasksTable;
  'app.catalogue_versions': CatalogueVersionsTable;
  'app.plans': PlansTable;
  'app.plan_components': PlanComponentsTable;
  'app.plan_component_tasks': PlanComponentTasksTable;
  'app.plan_prices': PlanPricesTable;
  'app.plan_component_prices': PlanComponentPricesTable;
  'app.import_batches': ImportBatchesTable;
  'app.import_rows': ImportRowsTable;
  'app.cities': CitiesTable;
  'app.clusters': ClustersTable;
  'app.communities': CommunitiesTable;
  'app.cluster_community_memberships': ClusterCommunityMembershipsTable;
  'app.towers': TowersTable;
  'app.flats': FlatsTable;
  'app.expansion_votes': ExpansionVotesTable;
  'app.permission_modules': PermissionModulesTable;
  'app.permission_actions': PermissionActionsTable;
  'app.permission_module_actions': PermissionModuleActionsTable;
  'app.admin_profiles': AdminProfilesTable;
  'app.roles': RolesTable;
  'app.role_grants': RoleGrantsTable;
  'app.admin_role_assignments': AdminRoleAssignmentsTable;
  'app.admin_extra_grants': AdminExtraGrantsTable;
  'app.admin_cluster_scopes': AdminClusterScopesTable;
  'app.admin_effective_grants': AdminEffectiveGrantsView;
  'app.audit_events': AuditEventsTable;
  'app.website_enquiries': WebsiteEnquiriesTable;
  'app.notification_outbox': NotificationOutboxTable;
}
