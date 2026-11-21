# Nestovin: entity-relationship diagram (as built)

**Source:** `supabase/migrations/20261120000100` … `20261129000800` (30 migrations), read on 21 Nov 2026.
This shows the **real** schema, not the design in `docs/Architecture/data-model.md`. Where they differ, see
`docs/reviews/2026-11-system-review.md` (finding M-8 lists the designed-but-not-built tables).

How to read it:
- One diagram per module, so each stays legible. Tables that belong to another module appear by name only,
  so you can see where the modules join.
- Only keys, scope columns, status columns and money columns are listed. Audit stamps (`version`,
  `created_*`, `updated_*`) are left out.
- `PK` = primary key, `FK` = foreign key, `UK` = unique. "(partial)" means a partial unique index; the
  predicate is in the label.
- Every `cluster_id` FK goes to `clusters`. Those edges are left out after the first diagram, because
  drawing them all hides everything else.
- **RLS** in a table comment marks a Tier A table (RLS enabled, not forced).

---

## 1. Identity, access and location master data (Tier B)

```mermaid
erDiagram
  auth_users ||--o| admin_profiles : "id = auth user"
  admin_profiles ||--o{ admin_role_assignments : has
  roles ||--o{ admin_role_assignments : "assigned (RESTRICT)"
  roles ||--o{ role_grants : "bundles (CASCADE)"
  permission_module_actions ||--o{ role_grants : "valid pair"
  permission_module_actions ||--o{ admin_extra_grants : "valid pair"
  permission_modules ||--o{ permission_module_actions : ""
  permission_actions ||--o{ permission_module_actions : ""
  admin_profiles ||--o{ admin_extra_grants : "CASCADE"
  admin_profiles ||--o{ admin_cluster_scopes : "CASCADE"
  clusters ||--o{ admin_cluster_scopes : ""

  cities ||--o{ communities : contains
  communities ||--o{ towers : contains
  towers ||--o{ flats : contains
  communities ||--o{ flats : "denormalised (trigger)"
  clusters ||--o{ cluster_community_memberships : groups
  communities ||--o{ cluster_community_memberships : "one open row (partial UK)"
  cities ||--o{ expansion_votes : "optional"

  admin_profiles {
    uuid id PK "FK auth.users"
    citext email UK
    bool is_super_admin "trigger keeps one ACTIVE"
    text status "INVITED|ACTIVE|DISABLED"
    text scope_type "GLOBAL|CLUSTERS"
  }
  roles {
    uuid id PK
    text name "UK lower(name)"
  }
  role_grants {
    uuid role_id PK
    text module_key PK
    text action_key PK
  }
  admin_cluster_scopes {
    uuid admin_id PK
    uuid cluster_id PK
  }
  cities {
    uuid id PK
    text name "UK (lower name, lower state)"
    text status "ACTIVE|INACTIVE"
  }
  clusters {
    uuid id PK
    text code "UK lower"
    text status "ACTIVE|INACTIVE"
  }
  communities {
    uuid id PK
    uuid city_id FK
    text code "UK lower"
    text status "DRAFT|IMPORTED|CONFIGURED|ACTIVE|INACTIVE"
    text default_operating_mode "DEMAND_LED|CONTINUOUS"
    text timezone "Asia/Kolkata"
    int geofence_radius_m "25-5000"
  }
  cluster_community_memberships {
    uuid id PK
    uuid cluster_id FK
    uuid community_id FK
    timestamptz effective_from
    timestamptz effective_to "null = open; close-only trigger"
  }
  towers {
    uuid id PK
    uuid community_id FK
    text name "UK (community, lower name)"
  }
  flats {
    uuid id PK
    uuid tower_id FK
    uuid community_id FK "set by trigger"
    uuid residence_category_id FK "composite FK (community_id, id)"
    text flat_number "UK (tower, lower)"
    text occupancy "OWNER|TENANT|VACANT"
  }
  expansion_votes {
    uuid id PK
    uuid resident_user_id "no FK"
    text level "CITY|COMMUNITY"
  }
```

## 2. Catalogue, pricing and community migration (Tier B)

```mermaid
erDiagram
  communities ||--o{ community_services : "enabled + mode"
  services ||--o{ community_services : ""
  communities ||--o{ residence_categories : ""
  communities ||--o{ time_windows : ""
  communities ||--o{ service_tasks : ""
  services ||--o{ service_tasks : ""
  communities ||--o{ catalogue_versions : "one PUBLISHED, one DRAFT (partial UK)"
  catalogue_versions ||--o{ plans : "CASCADE"
  plans ||--o{ plan_components : "CASCADE"
  services ||--o{ plan_components : ""
  time_windows ||--o{ plan_components : "optional"
  plan_components ||--o{ plan_component_tasks : "CASCADE"
  service_tasks ||--o{ plan_component_tasks : ""
  catalogue_versions ||--o{ plan_prices : "CASCADE"
  plans ||--o{ plan_prices : "CASCADE"
  residence_categories ||--o{ plan_prices : ""
  plan_components ||--o{ plan_component_prices : "CASCADE"
  residence_categories ||--o{ plan_component_prices : ""
  residence_categories ||--o{ flats : "pricing category"

  communities ||--o{ import_batches : ""
  import_batches ||--o{ import_rows : "CASCADE"
  import_batches ||--o| import_batches : supersedes

  services {
    uuid id PK
    text code UK "MAID|COOK|CARETAKER"
  }
  community_services {
    uuid community_id PK
    uuid service_id PK
    bool enabled
    text operating_mode "null = community default"
  }
  catalogue_versions {
    uuid id PK
    uuid community_id FK
    int version_no "UK (community, version_no)"
    text status "DRAFT|PUBLISHED|SUPERSEDED (guard trigger)"
  }
  plans {
    uuid id PK
    uuid catalogue_version_id FK
    text code "UK (version, lower code)"
    int validity_days "1-366"
  }
  plan_components {
    uuid id PK
    uuid plan_id FK
    uuid service_id FK
    bool is_optional_addon "UK (plan, service, addon)"
    smallint days_of_week "bitmask 1-127"
    int duration_minutes "15-1440"
  }
  plan_prices {
    uuid id PK
    uuid plan_id FK
    uuid residence_category_id FK
    text price_basis "PACKAGE|SERVICE"
    uuid service_id FK "null for PACKAGE"
    bigint amount_paise "> 0"
  }
  plan_component_prices {
    uuid plan_component_id PK
    uuid residence_category_id PK
    bigint amount_paise ">= 0"
  }
  import_batches {
    uuid id PK
    uuid community_id FK
    text status "VALIDATED|INVALID|APPROVED|REJECTED|COMMITTED|CANCELLED"
    text source "EXCEL|DASHBOARD"
  }
  import_rows {
    uuid batch_id PK
    int row_number PK
    jsonb raw
    jsonb normalized
  }
```

## 3. Residents, household and support (Tier A except categories and holidays)

```mermaid
erDiagram
  auth_users ||--o| resident_profiles : "id = auth user"
  resident_profiles ||--o{ residence_memberships : ""
  flats ||--o{ residence_memberships : ""
  residence_memberships ||--o{ residence_memberships : "FAMILY -> PRIMARY"
  residence_memberships ||--|| residence_verification_requests : "UK membership_id"
  documents ||--o{ residence_verification_requests : ""
  residence_memberships ||--o{ family_access_requests : "primary_membership_id"
  resident_profiles ||--o{ family_access_requests : requested_by
  residence_memberships |o--o| family_access_requests : resulting_membership_id
  residence_memberships ||--o{ resident_change_requests : ""
  resident_profiles ||--o{ support_tickets : ""
  residence_memberships |o--o{ support_tickets : "optional"
  ticket_categories ||--o{ support_tickets : ""
  support_tickets ||--o{ ticket_updates : "append-only"
  support_tickets ||--o{ ticket_escalations : "append-only"

  resident_profiles {
    uuid id PK "FK auth.users; RLS"
    text phone UK "E.164"
    text status "ACTIVE|SUSPENDED"
  }
  residence_memberships {
    uuid id PK "RLS"
    uuid resident_id FK
    uuid flat_id FK
    uuid community_id FK "trigger from flat"
    uuid cluster_id FK "trigger, frozen at insert"
    text kind "PRIMARY|FAMILY"
    text status "PENDING|VERIFIED|REJECTED|REVOKED|ENDED"
    uuid primary_membership_id FK "iff FAMILY"
  }
  documents {
    uuid id PK "RLS"
    text owner_type "RESIDENCE_VERIFICATION"
    uuid owner_id "polymorphic, no FK"
    text storage_key UK "server-generated"
    text status "PENDING_UPLOAD|UPLOADED"
  }
  residence_verification_requests {
    uuid id PK "RLS"
    uuid membership_id FK
    uuid document_id FK
    text decision "PENDING|APPROVED|REJECTED"
  }
  family_access_requests {
    uuid id PK "RLS"
    text phone "UK (primary, phone) where PENDING"
    text status "PENDING|APPROVED|REJECTED|CANCELLED"
  }
  resident_change_requests {
    uuid id PK "RLS"
    text kind "OCCUPANCY_CHANGE|MOVE_OUT"
    text status "UK (membership, kind) where PENDING"
  }
  support_tickets {
    uuid id PK "RLS"
    text reference UK
    uuid cluster_id FK "copied from membership"
    text status "OPEN|ASSIGNED|IN_PROGRESS|WAITING|RESOLVED|CLOSED"
    text escalation_level "NONE|CLUSTER_ADMIN|SUPER_ADMIN"
    timestamptz next_escalation_at
  }
  ticket_updates {
    bigint id PK "RLS; append-only trigger"
    text visibility "INTERNAL|RESIDENT"
  }
  ticket_escalations {
    uuid id PK "RLS; append-only trigger"
    text level "CLUSTER_ADMIN|SUPER_ADMIN"
  }
```

## 4. Demand, booking, subscription and payments

```mermaid
erDiagram
  communities ||--o{ demand_cycles : ""
  catalogue_versions ||--o{ demand_cycles : "locked on publish"
  demand_cycles ||--o{ demand_cycle_plans : "CASCADE"
  plans ||--o{ demand_cycle_plans : ""
  demand_cycles ||--o{ slot_sets : ""
  slot_sets ||--o{ slots : "DEMAND_LED only"
  communities ||--o{ slots : ""

  resident_profiles ||--o{ booking_terms_snapshots : ""
  booking_terms_snapshots ||--|| demand_requests : "UK terms_snapshot_id"
  demand_cycles ||--o{ demand_requests : "one active per flat (partial UK)"
  residence_memberships ||--o{ demand_requests : ""
  slots |o--o{ demand_requests : allocated_slot_id
  demand_requests ||--o{ demand_request_preferences : "CASCADE, rank 1-3"
  time_windows ||--o{ demand_request_preferences : ""

  demand_requests |o--o| bookings : "UK demand_request_id"
  booking_terms_snapshots ||--o{ bookings : "frozen terms"
  slots ||--o{ bookings : ""
  bookings ||--|| subscriptions : "UK booking_id"
  subscriptions |o--o| subscriptions : "renews (partial UK)"
  subscriptions |o--o{ bookings : renews_subscription_id
  subscriptions ||--o{ subscription_components : ""

  payment_orders ||--o{ payment_transactions : ""
  payment_transactions ||--o{ refund_records : ""
  payment_orders |o--o{ payment_exceptions : ""
  payment_transactions |o--o{ payment_exceptions : ""

  slots {
    uuid id PK
    text mode "CONTINUOUS|DEMAND_LED"
    uuid slot_set_id FK "iff DEMAND_LED"
    int capacity "households, 1-10000"
    text status "DRAFT|PUBLISHED|WITHDRAWN"
  }
  demand_cycles {
    uuid id PK
    smallint initial_pct "1-99, locked"
    text status "DRAFT|PUBLISHED|CLOSED|SLOTS_PUBLISHED|COMPLETED|CANCELLED"
  }
  booking_terms_snapshots {
    uuid id PK "RLS; immutable trigger"
    jsonb plan_snapshot
    bigint total_paise "= initial + remaining"
    bigint initial_due_paise
    bigint remaining_due_paise
    text disclosure_version "required if initial_pct"
  }
  demand_requests {
    uuid id PK "RLS"
    text reference UK
    uuid cluster_id FK
    text status "AWAITING_PAYMENT|COMMITTED|BALANCE_DUE|CONVERTED|EXPIRED|CANCELLED|REVIEW_REQUIRED"
    bigint initial_paid_paise
  }
  bookings {
    uuid id PK "RLS"
    text reference UK
    text mode "DEMAND_LED|CONTINUOUS"
    uuid slot_id FK
    date start_date
    text status "PENDING_PAYMENT|CONFIRMED|CANCELLED|EXPIRED|REVIEW_REQUIRED"
  }
  subscriptions {
    uuid id PK "RLS"
    date period_start
    date period_end ">= start"
    text status "PENDING_ACTIVATION|ACTIVE|ENDED|CANCELLED"
  }
  subscription_components {
    uuid id PK "RLS; copied from snapshot"
    uuid service_id FK
    time start_time
    smallint days_of_week
    smallint visits_per_day
  }
  payment_orders {
    uuid id PK "RLS"
    text ref_type "DEMAND_REQUEST|BOOKING (no FK)"
    uuid ref_id "polymorphic"
    text purpose "INITIAL|BALANCE|FULL"
    bigint amount_paise
    text provider_order_id UK
    text idempotency_key UK
    text status "CREATED|PAID|FAILED|EXPIRED|REVIEW_REQUIRED; one PAID per (ref, purpose)"
  }
  provider_events {
    uuid id PK "Tier B"
    text event_id UK
    bool signature_valid
    timestamptz processed_at
  }
  payment_transactions {
    uuid id PK "RLS; DELETE blocked"
    text provider_payment_id UK
    bigint amount_paise
    text status "CAPTURED|REFUNDED|PARTIALLY_REFUNDED"
  }
  refund_records {
    uuid id PK "RLS"
    bigint amount_paise
    text provider_refund_id UK
    text status "APPROVED|PROCESSED"
  }
  payment_exceptions {
    uuid id PK "RLS"
    text reason_code
    text status "OPEN|RESOLVED"
  }
```

## 5. Workforce, allocation and overtime (Tier A except checklists)

```mermaid
erDiagram
  clusters ||--o{ applicants : preferred
  applicants |o--o| employees : "UK applicant_id"
  auth_users |o--o| employees : "UK auth_user_id"
  clusters ||--o{ employees : home_cluster_id
  employees ||--o{ employee_verifications : ""
  verification_items ||--o{ employee_verifications : ""
  employees ||--o{ employee_qualifications : ""
  services ||--o{ employee_qualifications : ""
  employees ||--o{ employee_availability : "CASCADE"
  employees ||--o{ leave_requests : ""
  employees ||--o{ training_completions : ""
  training_items ||--o{ training_completions : ""

  subscription_components ||--o{ standing_assignments : "one ACTIVE (partial UK)"
  employees ||--o{ standing_assignments : ""
  subscription_components ||--o{ service_occurrences : "UK (component, date, visit_no)"
  subscriptions ||--o{ service_occurrences : ""
  flats ||--o{ service_occurrences : ""
  service_occurrences ||--o{ occurrence_assignments : "one ACTIVE (partial UK)"
  employees ||--o{ occurrence_assignments : "no overlap (EXCLUDE gist)"
  occurrence_assignments |o--o{ occurrence_assignments : replaced_assignment_id

  service_occurrences ||--o{ overtime_offers : "one OPEN (partial UK)"
  overtime_offers ||--o{ overtime_offer_responses : ""
  employees ||--o{ overtime_offer_responses : ""
  employees |o--o{ overtime_offers : confirmed_employee_id

  applicants {
    uuid id PK "RLS"
    text phone "UK where NEW|IN_REVIEW"
    text status "NEW|IN_REVIEW|REJECTED|CONVERTED"
  }
  employees {
    uuid id PK "RLS"
    text employee_code UK
    text phone "UK where not EXITED"
    uuid home_cluster_id FK
    text status "ACTIVE|INACTIVE|EXITED"
    text readiness "NOT_READY|READY"
    timestamptz sessions_valid_after
  }
  leave_requests {
    uuid id PK "RLS"
    date start_date
    date end_date ">= start"
    text status "PENDING|APPROVED|REJECTED|CANCELLED"
  }
  standing_assignments {
    uuid id PK "RLS"
    date effective_from
    date effective_to
    text status "ACTIVE|ENDED"
  }
  service_occurrences {
    uuid id PK "RLS"
    date scheduled_date
    smallint visit_no "1-6"
    timestamptz starts_at "null for visit 2+"
    text status "SCHEDULED|ASSIGNED|IN_PROGRESS|COMPLETION_SUBMITTED|COMPLETED|NO_SHOW|CANCELLED|EXCEPTION"
  }
  occurrence_assignments {
    uuid id PK "RLS"
    text source "STANDING|MANUAL|REPLACEMENT|OVERTIME"
    text status "ACTIVE|REPLACED|CANCELLED"
    timestamptz starts_at "copied"
  }
  overtime_offers {
    uuid id PK "RLS"
    text status "OPEN|FILLED|CANCELLED"
  }
  overtime_offer_responses {
    uuid offer_id PK "RLS"
    uuid employee_id PK
    text response "PENDING|ACCEPTED|REJECTED"
  }
```

## 6. Attendance and service execution (Tier A)

```mermaid
erDiagram
  service_occurrences ||--o{ attendance_challenges : "OTP/QR (HMAC hashes)"
  resident_profiles ||--o{ attendance_challenges : issued_to
  service_occurrences ||--o{ attendance_events : ""
  employees ||--o{ attendance_events : "UK (employee, client_event_id)"
  service_occurrences ||--o| service_completions : "PK occurrence_id"
  service_occurrences ||--o| no_show_records : "UK occurrence_id"
  service_occurrences ||--o{ attendance_corrections : "one PENDING (partial UK)"
  attendance_events |o--o{ attendance_corrections : original_event_id
  service_occurrences ||--o| visit_feedback : "PK occurrence_id"
  resident_profiles ||--o{ visit_feedback : ""

  attendance_challenges {
    uuid id PK
    text otp_hash
    text qr_hash
    timestamptz expires_at
    timestamptz used_at
    smallint failed_attempts "void at 5"
  }
  attendance_events {
    uuid id PK "evidence immutable (trigger)"
    text kind "CHECK_IN"
    text method "OTP|QR"
    text result "VERIFIED|REJECTED"
    text_array flags
    text review_status "NONE|OPEN|ACCEPTED|REJECTED"
  }
  service_completions {
    uuid occurrence_id PK
    uuid employee_id FK
  }
  no_show_records {
    uuid id PK
    text kind "RESIDENT_ABSENT|WORKER_ABSENT"
  }
  attendance_corrections {
    uuid id PK
    text requested_change "MARK_ATTENDED|MARK_COMPLETED"
    text status "PENDING|APPROVED|REJECTED"
  }
  visit_feedback {
    uuid occurrence_id PK
    smallint rating "1-5"
  }
```

## 7. Payroll and finance

```mermaid
erDiagram
  employees ||--o{ compensation_profiles : "no overlap (EXCLUDE gist)"
  payroll_periods ||--o{ payroll_runs : "UK (period, version)"
  payroll_runs ||--o{ payroll_lines : "CASCADE; UK (run, employee)"
  employees ||--o{ payroll_lines : ""
  payroll_lines ||--o{ payroll_line_items : "CASCADE"
  payroll_lines ||--o{ salary_payments : "RESTRICT"
  salary_payments |o--o| salary_payments : "reverses (UK)"
  salary_payments ||--|| expense_entries : "UK salary_payment_id"

  compensation_profiles {
    uuid id PK "RLS"
    bigint monthly_amount_paise "> 0"
    date effective_from
    date effective_to
  }
  payroll_periods {
    uuid id PK "Tier B"
    date month UK "first of month"
  }
  payroll_runs {
    uuid id PK "Tier B"
    int version
    text status "DRAFT|IN_REVIEW|APPROVED|RETURNED; one open, one APPROVED (partial UK)"
  }
  payroll_lines {
    uuid id PK "RLS"
    bigint earnings_paise
    bigint deductions_paise
    bigint net_paise
    jsonb compensation_snapshot
  }
  payroll_line_items {
    uuid id PK "RLS"
    text kind "EARNING|DEDUCTION"
    bigint amount_paise "> 0"
    text source_type "CALCULATED|AUTHORISED_ENTRY"
  }
  salary_payments {
    uuid id PK "RLS; append-only trigger"
    bigint amount_paise "<> 0; negative = reversal"
    text reference "UK (method, lower ref)"
  }
  expense_entries {
    uuid id PK "RLS; append-only trigger"
    bigint amount_paise
  }
```

## 8. Cross-cutting: audit, outbox, notifications, settings (Tier B except inbox and devices)

```mermaid
erDiagram
  notification_outbox |o--o| notifications : "outbox_id (SET NULL)"

  audit_events {
    bigint id PK "append-only trigger, no truncate"
    text actor_kind
    text action "module.verb"
    text target_type
    text target_id
  }
  notification_outbox {
    uuid id PK
    text dedupe_key UK
    text channel "EMAIL|SMS|PUSH"
    text recipient "resident/employee id or address"
    text status "PENDING|SENT|FAILED|DEAD|SKIPPED"
    int attempts
    timestamptz next_attempt_at
  }
  notifications {
    uuid id PK "RLS"
    text recipient_kind "resident|employee"
    uuid recipient_id "polymorphic, no FK"
    timestamptz read_at "only column app_api may update"
  }
  device_tokens {
    uuid id PK "RLS"
    text owner_kind "resident|employee"
    uuid owner_id "polymorphic, no FK"
    text token UK
  }
  website_enquiries {
    uuid id PK
    text reference UK
    text status "NEW|IN_PROGRESS|CLOSED"
  }
  rate_limit_buckets {
    text bucket_key PK
    timestamptz window_start PK
    int hits
  }
  app_settings {
    text key PK "incl. jobs_lease_until"
    jsonb value
  }
  business_holidays {
    date holiday_date PK
  }
```

## Polymorphic and unconstrained references

These columns point at other rows without a foreign key. Each is a place where a dangling reference is possible:

| Column | Points to | Guard today |
|---|---|---|
| `payment_orders.(ref_type, ref_id)` | `demand_requests` or `bookings` | CHECK on `ref_type` only |
| `documents.(owner_type, owner_id)` | `residence_memberships` | CHECK on `owner_type` only |
| `notifications.recipient_id`, `device_tokens.owner_id` | `resident_profiles` or `employees` | none |
| `notification_outbox.recipient` | profile id, email or phone | none |
| `expansion_votes.resident_user_id` | `resident_profiles` | none |
| `support_tickets.owner_admin_id`, every `*_by` column | `admin_profiles` / auth users | none (audit only) |
| `audit_events.target_id` | any row | none (by design) |
