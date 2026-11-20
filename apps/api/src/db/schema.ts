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
  geofence_radius_m: Generated<number>;
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
  source: Generated<'EXCEL' | 'DASHBOARD'>;
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

// ------------------------------------------------------------- Phase 3

export interface ResidentProfilesTable extends Stamped {
  id: string;
  phone: string;
  full_name: string | null;
  email: string | null;
  status: Generated<'ACTIVE' | 'SUSPENDED'>;
}

export interface ResidenceMembershipsTable extends Stamped {
  id: Generated<string>;
  resident_id: string;
  flat_id: string;
  /** Set by trigger from the flat. */
  community_id: ColumnType<string, string | undefined, string>;
  cluster_id: ColumnType<string | null, string | null | undefined, string | null>;
  kind: 'PRIMARY' | 'FAMILY';
  occupancy: 'OWNER' | 'TENANT' | 'FAMILY';
  status: Generated<'PENDING' | 'VERIFIED' | 'REJECTED' | 'REVOKED' | 'ENDED'>;
  primary_membership_id: string | null;
  verified_at: Timestamp | null;
  verified_by: string | null;
  ended_at: Timestamp | null;
  end_reason: string | null;
}

export interface DocumentsTable {
  id: Generated<string>;
  owner_type: 'RESIDENCE_VERIFICATION';
  owner_id: string;
  doc_type: 'OWNERSHIP_PROOF' | 'RENT_AGREEMENT' | 'ELECTRICITY_BILL' | 'SOCIETY_ID';
  bucket: string;
  storage_key: string;
  file_name: string;
  mime_type: 'application/pdf' | 'image/jpeg' | 'image/png';
  size_bytes: number | null;
  status: Generated<'PENDING_UPLOAD' | 'UPLOADED'>;
  uploaded_by: string;
  community_id: string;
  cluster_id: string | null;
  created_at: Generated<Date>;
  uploaded_at: Timestamp | null;
}

export interface ResidenceVerificationRequestsTable {
  id: Generated<string>;
  membership_id: string;
  document_id: string;
  community_id: string;
  cluster_id: string | null;
  decision: Generated<'PENDING' | 'APPROVED' | 'REJECTED'>;
  reviewed_by: string | null;
  reviewed_at: Timestamp | null;
  reason: string | null;
  created_at: Generated<Date>;
}

export interface FamilyAccessRequestsTable {
  id: Generated<string>;
  primary_membership_id: string;
  requested_by: string;
  phone: string;
  full_name: string;
  relationship: string;
  community_id: string;
  cluster_id: string | null;
  status: Generated<'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'>;
  physical_verification_at: Timestamp | null;
  reviewed_by: string | null;
  reviewed_at: Timestamp | null;
  reason: string | null;
  resulting_membership_id: string | null;
  created_at: Generated<Date>;
}

export interface TicketCategoriesTable {
  id: Generated<string>;
  name: string;
  status: Generated<'ACTIVE' | 'INACTIVE'>;
  sort: Generated<number>;
}

export interface SupportTicketsTable extends Stamped {
  id: Generated<string>;
  reference: Generated<string>;
  resident_id: string;
  membership_id: string | null;
  flat_id: string | null;
  community_id: string | null;
  cluster_id: string | null;
  category_id: string;
  subject: string;
  description: string;
  priority: Generated<'LOW' | 'NORMAL' | 'HIGH'>;
  urgent: Generated<boolean>;
  status: Generated<'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'WAITING' | 'RESOLVED' | 'CLOSED'>;
  owner_admin_id: string | null;
  due_at: Timestamp | null;
  resolved_at: Timestamp | null;
  closed_at: Timestamp | null;
  escalation_level: Generated<'NONE' | 'CLUSTER_ADMIN' | 'SUPER_ADMIN'>;
  escalated_at: Timestamp | null;
  next_escalation_at: Timestamp | null;
}

export interface BusinessHolidaysTable {
  holiday_date: DateStr;
  name: string;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface TicketEscalationsTable {
  id: Generated<string>;
  ticket_id: string;
  cluster_id: string | null;
  level: 'CLUSTER_ADMIN' | 'SUPER_ADMIN';
  trigger: 'OVERDUE' | 'URGENT' | 'MANUAL';
  reason: string | null;
  escalated_by: string | null;
  notified: Generated<number>;
  created_at: Generated<Date>;
}

export interface TicketUpdatesTable {
  id: Generated<string>;
  ticket_id: string;
  author_kind: 'admin' | 'resident' | 'system';
  author_id: string | null;
  visibility: 'INTERNAL' | 'RESIDENT';
  body: string;
  created_at: Generated<Date>;
}

// ---------------------------------------------------------------- Phase 4
/** bigint paise come back from pg as strings (INT8 parser). */
type Paise = ColumnType<string, number | string, number | string>;
/** DATE columns are kept as 'YYYY-MM-DD' strings. */
type DateStr = ColumnType<string, string, string>;
type Json = ColumnType<unknown, string, string>;

export interface AppSettingsTable {
  key: string;
  value: Json;
  updated_at: Generated<Date>;
  updated_by: string | null;
}

export interface SlotSetsTable extends Stamped {
  id: Generated<string>;
  cycle_id: string;
  status: Generated<'DRAFT' | 'PUBLISHED' | 'WITHDRAWN'>;
  commencement_date: DateStr;
  balance_due_at: Timestamp;
  published_by: string | null;
  published_at: Timestamp | null;
}

export interface SlotsTable extends Stamped {
  id: Generated<string>;
  community_id: string;
  mode: 'CONTINUOUS' | 'DEMAND_LED';
  slot_set_id: string | null;
  service_id: string | null;
  label: string;
  start_time: string;
  duration_minutes: number;
  days_of_week: Generated<number>;
  capacity: number;
  status: Generated<'DRAFT' | 'PUBLISHED' | 'WITHDRAWN'>;
}

export type DemandCycleStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'SLOTS_PUBLISHED' | 'COMPLETED' | 'CANCELLED';
export interface DemandCyclesTable extends Stamped {
  id: Generated<string>;
  community_id: string;
  name: string;
  opens_at: Timestamp;
  closes_at: Timestamp;
  initial_pct: number | null;
  catalogue_version_id: string | null;
  status: Generated<DemandCycleStatus>;
  published_by: string | null;
  published_at: Timestamp | null;
  closed_at: Timestamp | null;
}

export interface DemandCyclePlansTable {
  cycle_id: string;
  plan_id: string;
}

export interface BookingTermsSnapshotsTable {
  id: Generated<string>;
  resident_id: string;
  flat_id: string;
  community_id: string;
  cluster_id: string | null;
  catalogue_version_id: string;
  plan_id: string;
  service_id: string | null;
  residence_category_id: string;
  plan_snapshot: Json;
  total_paise: Paise;
  tax_paise: Paise | null;
  initial_pct: number | null;
  initial_due_paise: Paise;
  remaining_due_paise: Paise;
  currency: Generated<string>;
  cycle_id: string | null;
  validity_days: number;
  disclosure_version: string | null;
  disclosure_accepted_at: Timestamp | null;
  created_at: Generated<Date>;
}

export type DemandRequestStatus =
  | 'AWAITING_PAYMENT'
  | 'COMMITTED'
  | 'BALANCE_DUE'
  | 'CONVERTED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'REVIEW_REQUIRED';
export interface DemandRequestsTable extends Stamped {
  id: Generated<string>;
  reference: Generated<string>;
  cycle_id: string;
  resident_id: string;
  membership_id: string;
  flat_id: string;
  community_id: string;
  cluster_id: string | null;
  terms_snapshot_id: string;
  status: Generated<DemandRequestStatus>;
  allocated_slot_id: string | null;
  initial_paid_paise: ColumnType<string, number | string | undefined, number | string>;
  committed_at: Timestamp | null;
  ended_at: Timestamp | null;
  end_reason: string | null;
}

export interface DemandRequestPreferencesTable {
  request_id: string;
  rank: number;
  time_window_id: string;
}

export type BookingStatus = 'PENDING_PAYMENT' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED' | 'REVIEW_REQUIRED';
export interface BookingsTable extends Stamped {
  id: Generated<string>;
  reference: Generated<string>;
  mode: 'DEMAND_LED' | 'CONTINUOUS';
  demand_request_id: string | null;
  resident_id: string;
  membership_id: string;
  flat_id: string;
  community_id: string;
  cluster_id: string | null;
  terms_snapshot_id: string;
  slot_id: string;
  start_date: DateStr;
  renews_subscription_id: string | null;
  status: Generated<BookingStatus>;
  confirmed_at: Timestamp | null;
  ended_at: Timestamp | null;
  end_reason: string | null;
}

export interface SubscriptionsTable extends Stamped {
  id: Generated<string>;
  booking_id: string;
  resident_id: string;
  flat_id: string;
  community_id: string;
  cluster_id: string | null;
  period_start: DateStr;
  period_end: DateStr;
  status: Generated<'PENDING_ACTIVATION' | 'ACTIVE' | 'ENDED' | 'CANCELLED'>;
  renews_subscription_id: string | null;
}

export interface SubscriptionComponentsTable {
  id: Generated<string>;
  subscription_id: string;
  cluster_id: string | null;
  service_id: string;
  start_time: string;
  duration_minutes: number;
  days_of_week: number;
  visits_per_day: number;
  is_addon: Generated<boolean>;
  created_at: Generated<Date>;
}

export type PaymentPurpose = 'INITIAL' | 'BALANCE' | 'FULL';
export type PaymentOrderStatus = 'CREATED' | 'PAID' | 'FAILED' | 'EXPIRED' | 'REVIEW_REQUIRED';
export interface PaymentOrdersTable extends Stamped {
  id: Generated<string>;
  purpose: PaymentPurpose;
  ref_type: 'DEMAND_REQUEST' | 'BOOKING';
  ref_id: string;
  resident_id: string;
  flat_id: string;
  community_id: string;
  cluster_id: string | null;
  amount_paise: Paise;
  currency: Generated<string>;
  provider: Generated<string>;
  provider_order_id: string | null;
  idempotency_key: string;
  status: Generated<PaymentOrderStatus>;
  expires_at: Timestamp;
  paid_at: Timestamp | null;
}

export interface ProviderEventsTable {
  id: Generated<string>;
  provider: Generated<string>;
  event_id: string;
  event_type: string;
  payload: Json;
  signature_valid: boolean;
  received_at: Generated<Date>;
  processed_at: Timestamp | null;
  processing_error: string | null;
}

export interface PaymentTransactionsTable {
  id: Generated<string>;
  order_id: string;
  resident_id: string;
  cluster_id: string | null;
  provider_payment_id: string;
  amount_paise: Paise;
  currency: string;
  method: string | null;
  status: 'CAPTURED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';
  verified_via: 'CHECKOUT' | 'WEBHOOK' | 'RECONCILIATION';
  verified_at: Generated<Date>;
}

export interface RefundRecordsTable {
  id: Generated<string>;
  transaction_id: string;
  cluster_id: string | null;
  amount_paise: Paise;
  reason: string | null;
  status: Generated<'APPROVED' | 'PROCESSED'>;
  approved_by: string | null;
  approved_at: Timestamp | null;
  provider_refund_id: string | null;
  processed_at: Timestamp | null;
  created_at: Generated<Date>;
}

export type PaymentExceptionReason =
  | 'AMOUNT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'SLOT_UNAVAILABLE'
  | 'CYCLE_CLOSED'
  | 'DEADLINE_PASSED'
  | 'DUPLICATE_PAYMENT'
  | 'RECORD_NOT_PAYABLE'
  | 'UNAPPROVED_REFUND'
  | 'UNKNOWN_ORDER';
export interface PaymentExceptionsTable {
  id: Generated<string>;
  order_id: string | null;
  transaction_id: string | null;
  cluster_id: string | null;
  reason_code: PaymentExceptionReason;
  detail: string | null;
  status: Generated<'OPEN' | 'RESOLVED'>;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: Timestamp | null;
  created_at: Generated<Date>;
}

// ---------------------------------------------------------------- Phase 5
export interface ApplicantsTable extends Stamped {
  id: Generated<string>;
  full_name: string;
  phone: string;
  city: string | null;
  preferred_cluster_id: string | null;
  services: Generated<string[]>;
  experience_note: string | null;
  source: Generated<'APP' | 'ADMIN'>;
  status: Generated<'NEW' | 'IN_REVIEW' | 'REJECTED' | 'CONVERTED'>;
  reviewed_by: string | null;
  review_note: string | null;
}

export interface EmployeesTable extends Stamped {
  id: Generated<string>;
  employee_code: Generated<string>;
  auth_user_id: string | null;
  applicant_id: string | null;
  full_name: string;
  phone: string;
  home_cluster_id: string;
  status: Generated<'ACTIVE' | 'INACTIVE' | 'EXITED'>;
  readiness: Generated<'NOT_READY' | 'READY'>;
  readiness_note: string | null;
  joined_on: DateStr | null;
  login_enabled_at: Timestamp | null;
  must_change_password: Generated<boolean>;
  sessions_valid_after: Timestamp | null;
  exited_on: DateStr | null;
}

export interface VerificationItemsTable {
  id: Generated<string>;
  name: string;
  required: Generated<boolean>;
  status: Generated<'ACTIVE' | 'INACTIVE'>;
  sort: Generated<number>;
}

export interface EmployeeVerificationsTable {
  employee_id: string;
  item_id: string;
  cluster_id: string | null;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  note: string | null;
  reviewed_by: string | null;
  reviewed_at: Generated<Date>;
}

export interface EmployeeQualificationsTable {
  employee_id: string;
  service_id: string;
  cluster_id: string | null;
  approved_by: string | null;
  approved_at: Generated<Date>;
}

export interface EmployeeAvailabilityTable {
  id: Generated<string>;
  employee_id: string;
  cluster_id: string | null;
  days_of_week: number;
  start_time: string;
  end_time: string;
}

export interface LeaveRequestsTable extends Stamped {
  id: Generated<string>;
  employee_id: string;
  cluster_id: string | null;
  start_date: DateStr;
  end_date: DateStr;
  reason: string | null;
  status: Generated<'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'>;
  reviewed_by: string | null;
  reviewed_at: Timestamp | null;
  review_note: string | null;
}

export interface TrainingItemsTable {
  id: Generated<string>;
  title: string;
  url: string;
  status: Generated<'ACTIVE' | 'INACTIVE'>;
  sort: Generated<number>;
}

export interface TrainingCompletionsTable {
  employee_id: string;
  item_id: string;
  cluster_id: string | null;
  completed_at: Generated<Date>;
}

export interface StandingAssignmentsTable {
  id: Generated<string>;
  subscription_component_id: string;
  employee_id: string;
  cluster_id: string | null;
  effective_from: DateStr;
  effective_to: DateStr | null;
  status: Generated<'ACTIVE' | 'ENDED'>;
  end_reason: string | null;
  confirmed_by: string | null;
  created_at: Generated<Date>;
}

export type OccurrenceStatus =
  | 'SCHEDULED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'COMPLETION_SUBMITTED'
  | 'COMPLETED'
  | 'NO_SHOW'
  | 'CANCELLED'
  | 'EXCEPTION';
export interface ServiceOccurrencesTable extends Stamped {
  id: Generated<string>;
  subscription_component_id: string;
  subscription_id: string;
  service_id: string;
  flat_id: string;
  community_id: string;
  cluster_id: string | null;
  scheduled_date: DateStr;
  visit_no: Generated<number>;
  starts_at: Timestamp | null;
  ends_at: Timestamp | null;
  status: Generated<OccurrenceStatus>;
}

export interface OccurrenceAssignmentsTable {
  id: Generated<string>;
  occurrence_id: string;
  employee_id: string;
  cluster_id: string | null;
  source: 'STANDING' | 'MANUAL' | 'REPLACEMENT' | 'OVERTIME';
  replaced_assignment_id: string | null;
  status: Generated<'ACTIVE' | 'REPLACED' | 'CANCELLED'>;
  starts_at: Timestamp | null;
  ends_at: Timestamp | null;
  assigned_by: string | null;
  reason: string | null;
  created_at: Generated<Date>;
}

// ---------------------------------------------------------------- Phase 6
export interface AttendanceChallengesTable {
  id: Generated<string>;
  occurrence_id: string;
  flat_id: string;
  cluster_id: string | null;
  otp_hash: string;
  qr_hash: string;
  issued_to: string;
  expires_at: Timestamp;
  used_at: Timestamp | null;
  failed_attempts: Generated<number>;
  created_at: Generated<Date>;
}

export interface AttendanceEventsTable {
  id: Generated<string>;
  occurrence_id: string;
  employee_id: string;
  cluster_id: string | null;
  kind: 'CHECK_IN';
  method: 'OTP' | 'QR';
  result: 'VERIFIED' | 'REJECTED';
  reject_reason: string | null;
  flags: Generated<string[]>;
  lat: Numeric | null;
  lng: Numeric | null;
  accuracy_m: Numeric | null;
  distance_m: number | null;
  device_time: Timestamp | null;
  client_event_id: string;
  server_time: Generated<Date>;
  review_status: Generated<'NONE' | 'OPEN' | 'ACCEPTED' | 'REJECTED'>;
  reviewed_by: string | null;
  review_note: string | null;
}

export interface ServiceCompletionsTable {
  occurrence_id: string;
  employee_id: string;
  cluster_id: string | null;
  flat_id: string;
  note: string | null;
  completed_at: Generated<Date>;
}

export interface NoShowRecordsTable {
  id: Generated<string>;
  occurrence_id: string;
  cluster_id: string | null;
  flat_id: string;
  kind: 'RESIDENT_ABSENT' | 'WORKER_ABSENT';
  recorded_by_kind: 'employee' | 'admin';
  recorded_by: string;
  employee_id: string | null;
  note: string | null;
  lat: Numeric | null;
  lng: Numeric | null;
  created_at: Generated<Date>;
}

export interface AttendanceCorrectionsTable {
  id: Generated<string>;
  occurrence_id: string;
  employee_id: string;
  cluster_id: string | null;
  original_event_id: string | null;
  requested_change: 'MARK_ATTENDED' | 'MARK_COMPLETED';
  explanation: string;
  status: Generated<'PENDING' | 'APPROVED' | 'REJECTED'>;
  reviewed_by: string | null;
  reviewed_at: Timestamp | null;
  review_note: string | null;
  created_at: Generated<Date>;
}

export interface VisitFeedbackTable {
  occurrence_id: string;
  resident_id: string;
  flat_id: string;
  cluster_id: string | null;
  employee_id: string | null;
  rating: number;
  comment: string | null;
  created_at: Generated<Date>;
}

// ---------------------------------------------------------------- Phase 8
export interface CompensationProfilesTable {
  id: Generated<string>;
  employee_id: string;
  cluster_id: string | null;
  compensation_type: Generated<'FIXED_MONTHLY'>;
  monthly_amount_paise: Paise;
  currency: Generated<string>;
  effective_from: DateStr;
  effective_to: DateStr | null;
  approved_by: string | null;
  created_at: Generated<Date>;
}

export interface PayrollPeriodsTable {
  id: Generated<string>;
  month: DateStr;
  created_at: Generated<Date>;
}

export type PayrollRunStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'RETURNED';
export interface PayrollRunsTable {
  id: Generated<string>;
  period_id: string;
  version: number;
  status: Generated<PayrollRunStatus>;
  prepared_by: string | null;
  submitted_at: Timestamp | null;
  reviewed_by: string | null;
  reviewed_at: Timestamp | null;
  return_reason: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PayrollLinesTable {
  id: Generated<string>;
  run_id: string;
  employee_id: string;
  cluster_id: string | null;
  compensation_snapshot: Json;
  days_in_month: number;
  payable_days: Generated<number>;
  attendance_summary: Json;
  earnings_paise: ColumnType<string, number | string | undefined, number | string>;
  deductions_paise: ColumnType<string, number | string | undefined, number | string>;
  net_paise: ColumnType<string, number | string | undefined, number | string>;
  flags: Generated<string[]>;
}

export type PayrollComponent = 'BASE_SALARY' | 'ALLOWANCE' | 'INCENTIVE' | 'APPROVED_OVERTIME' | 'ABSENCE_DEDUCTION' | 'OTHER_DEDUCTION' | 'OTHER_EARNING';
export interface PayrollLineItemsTable {
  id: Generated<string>;
  line_id: string;
  cluster_id: string | null;
  kind: 'EARNING' | 'DEDUCTION';
  component: PayrollComponent;
  amount_paise: Paise;
  source_type: 'CALCULATED' | 'AUTHORISED_ENTRY';
  note: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface SalaryPaymentsTable {
  id: Generated<string>;
  line_id: string;
  employee_id: string;
  cluster_id: string | null;
  amount_paise: Paise;
  paid_on: DateStr;
  method: 'BANK_TRANSFER' | 'UPI' | 'CHEQUE' | 'CASH';
  reference: string | null;
  reverses_payment_id: string | null;
  note: string | null;
  recorded_by: string | null;
  created_at: Generated<Date>;
}

export interface ExpenseEntriesTable {
  id: Generated<string>;
  category: Generated<'SALARY'>;
  cluster_id: string | null;
  amount_paise: Paise;
  entry_date: DateStr;
  salary_payment_id: string;
  description: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface ResidentChangeRequestsTable {
  id: Generated<string>;
  resident_id: string;
  membership_id: string;
  flat_id: string;
  community_id: string;
  cluster_id: string | null;
  kind: 'OCCUPANCY_CHANGE' | 'MOVE_OUT';
  requested: Json;
  reason: string | null;
  status: Generated<'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'>;
  reviewed_by: string | null;
  reviewed_at: Timestamp | null;
  review_note: string | null;
  created_at: Generated<Date>;
}

export interface OvertimeOffersTable {
  id: Generated<string>;
  occurrence_id: string;
  cluster_id: string | null;
  note: string | null;
  status: Generated<'OPEN' | 'FILLED' | 'CANCELLED'>;
  confirmed_employee_id: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  closed_at: Timestamp | null;
}

export interface OvertimeOfferResponsesTable {
  offer_id: string;
  employee_id: string;
  cluster_id: string | null;
  response: Generated<'PENDING' | 'ACCEPTED' | 'REJECTED'>;
  responded_at: Timestamp | null;
}

export interface DB {
  'app.overtime_offers': OvertimeOffersTable;
  'app.overtime_offer_responses': OvertimeOfferResponsesTable;
  'app.resident_change_requests': ResidentChangeRequestsTable;
  'app.compensation_profiles': CompensationProfilesTable;
  'app.payroll_periods': PayrollPeriodsTable;
  'app.payroll_runs': PayrollRunsTable;
  'app.payroll_lines': PayrollLinesTable;
  'app.payroll_line_items': PayrollLineItemsTable;
  'app.salary_payments': SalaryPaymentsTable;
  'app.expense_entries': ExpenseEntriesTable;
  'app.business_holidays': BusinessHolidaysTable;
  'app.ticket_escalations': TicketEscalationsTable;
  'app.attendance_challenges': AttendanceChallengesTable;
  'app.attendance_events': AttendanceEventsTable;
  'app.service_completions': ServiceCompletionsTable;
  'app.no_show_records': NoShowRecordsTable;
  'app.attendance_corrections': AttendanceCorrectionsTable;
  'app.visit_feedback': VisitFeedbackTable;
  'app.applicants': ApplicantsTable;
  'app.employees': EmployeesTable;
  'app.verification_items': VerificationItemsTable;
  'app.employee_verifications': EmployeeVerificationsTable;
  'app.employee_qualifications': EmployeeQualificationsTable;
  'app.employee_availability': EmployeeAvailabilityTable;
  'app.leave_requests': LeaveRequestsTable;
  'app.training_items': TrainingItemsTable;
  'app.training_completions': TrainingCompletionsTable;
  'app.standing_assignments': StandingAssignmentsTable;
  'app.service_occurrences': ServiceOccurrencesTable;
  'app.occurrence_assignments': OccurrenceAssignmentsTable;
  'app.app_settings': AppSettingsTable;
  'app.slot_sets': SlotSetsTable;
  'app.slots': SlotsTable;
  'app.demand_cycles': DemandCyclesTable;
  'app.demand_cycle_plans': DemandCyclePlansTable;
  'app.booking_terms_snapshots': BookingTermsSnapshotsTable;
  'app.demand_requests': DemandRequestsTable;
  'app.demand_request_preferences': DemandRequestPreferencesTable;
  'app.bookings': BookingsTable;
  'app.subscriptions': SubscriptionsTable;
  'app.subscription_components': SubscriptionComponentsTable;
  'app.payment_orders': PaymentOrdersTable;
  'app.provider_events': ProviderEventsTable;
  'app.payment_transactions': PaymentTransactionsTable;
  'app.refund_records': RefundRecordsTable;
  'app.payment_exceptions': PaymentExceptionsTable;
  'app.resident_profiles': ResidentProfilesTable;
  'app.residence_memberships': ResidenceMembershipsTable;
  'app.documents': DocumentsTable;
  'app.residence_verification_requests': ResidenceVerificationRequestsTable;
  'app.family_access_requests': FamilyAccessRequestsTable;
  'app.ticket_categories': TicketCategoriesTable;
  'app.support_tickets': SupportTicketsTable;
  'app.ticket_updates': TicketUpdatesTable;
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
