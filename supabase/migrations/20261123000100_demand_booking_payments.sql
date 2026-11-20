-- ============================================================================
-- Phase 4: slots, demand cycles, bookings, subscriptions and payments
-- (RES-06..09, ADM-08, ADM-10; ADR-004, ADR-006, ADR-013, ADR-015).
--
-- Tier B (no RLS; admin authZ + privileges): app_settings, slots, slot_sets,
--   demand_cycles, demand_cycle_plans, provider_events.
-- Tier A (RLS): booking_terms_snapshots, demand_requests,
--   demand_request_preferences, bookings, subscriptions,
--   subscription_components, payment_orders, payment_transactions,
--   refund_records, payment_exceptions.
-- The webhook/maintenance path runs with actor_kind = 'system'.
-- ============================================================================

-- ------------------------------------------------------------ settings
create table app.app_settings (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]{1,62}$'),
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
insert into app.app_settings (key, value) values
  ('booking_window_days', '14'::jsonb),            -- ADR-015: continuous start date tomorrow .. +N days
  ('payment_order_ttl_minutes', '30'::jsonb);       -- unpaid orders expire (no business effect)

-- ------------------------------------------------------------ slots (ADM-10)
create table app.slot_sets (
  id                 uuid primary key default gen_random_uuid(),
  cycle_id           uuid not null,  -- FK added after demand_cycles
  status             text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED', 'WITHDRAWN')),
  commencement_date  date not null,
  balance_due_at     timestamptz not null,
  published_by       uuid,
  published_at       timestamptz,
  version            integer not null default 1,
  created_at         timestamptz not null default now(),
  created_by         uuid,
  updated_at         timestamptz not null default now(),
  updated_by         uuid
);

-- A fixed time slot with an admin-set capacity in households (ADR-013).
-- CONTINUOUS slots are published directly; DEMAND_LED slots belong to a slot set.
create table app.slots (
  id                uuid primary key default gen_random_uuid(),
  community_id      uuid not null references app.communities (id) on delete restrict,
  mode              text not null check (mode in ('CONTINUOUS', 'DEMAND_LED')),
  slot_set_id       uuid references app.slot_sets (id) on delete restrict,
  service_id        uuid references app.services (id) on delete restrict, -- null = any service
  label             text not null check (length(trim(label)) between 1 and 60),
  start_time        time not null,
  duration_minutes  integer not null check (duration_minutes between 15 and 720),
  days_of_week      smallint not null default 127 check (days_of_week between 1 and 127),
  capacity          integer not null check (capacity between 1 and 10000),
  status            text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED', 'WITHDRAWN')),
  version           integer not null default 1,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz not null default now(),
  updated_by        uuid,
  constraint slots_set_mode check ((mode = 'DEMAND_LED') = (slot_set_id is not null))
);
create index slots_community_idx on app.slots (community_id, mode, status);

-- ------------------------------------------------------------ demand cycles
create table app.demand_cycles (
  id                    uuid primary key default gen_random_uuid(),
  community_id          uuid not null references app.communities (id) on delete restrict,
  name                  text not null check (length(trim(name)) between 1 and 80),
  opens_at              timestamptz not null,
  closes_at             timestamptz not null,
  initial_pct           smallint check (initial_pct between 1 and 99),
  catalogue_version_id  uuid references app.catalogue_versions (id) on delete restrict,
  status                text not null default 'DRAFT'
                        check (status in ('DRAFT', 'PUBLISHED', 'CLOSED', 'SLOTS_PUBLISHED', 'COMPLETED', 'CANCELLED')),
  published_by          uuid,
  published_at          timestamptz,
  closed_at             timestamptz,
  version               integer not null default 1,
  created_at            timestamptz not null default now(),
  created_by            uuid,
  updated_at            timestamptz not null default now(),
  updated_by            uuid,
  constraint demand_cycles_window check (closes_at > opens_at),
  constraint demand_cycles_published_fields check (
    status in ('DRAFT', 'CANCELLED') or (initial_pct is not null and catalogue_version_id is not null and published_at is not null)
  )
);
create index demand_cycles_community_idx on app.demand_cycles (community_id, status);
alter table app.slot_sets add constraint slot_sets_cycle_fk foreign key (cycle_id) references app.demand_cycles (id) on delete restrict;
create index slot_sets_cycle_idx on app.slot_sets (cycle_id);

create table app.demand_cycle_plans (
  cycle_id  uuid not null references app.demand_cycles (id) on delete cascade,
  plan_id   uuid not null references app.plans (id) on delete restrict,
  primary key (cycle_id, plan_id)
);

-- Locked configuration: percentage, window start and catalogue never change after publication.
create or replace function app.tg_demand_cycle_lock() returns trigger
language plpgsql
as $$
begin
  if old.status <> 'DRAFT' then
    if new.initial_pct is distinct from old.initial_pct
       or new.catalogue_version_id is distinct from old.catalogue_version_id
       or new.opens_at is distinct from old.opens_at
       or new.community_id is distinct from old.community_id then
      raise exception 'Cannot change the locked configuration of a published demand cycle' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end
$$;
create trigger demand_cycles_lock before update on app.demand_cycles
  for each row execute function app.tg_demand_cycle_lock();

create or replace function app.tg_demand_cycle_plans_lock() returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  select status into v_status from app.demand_cycles where id = coalesce(new.cycle_id, old.cycle_id);
  if v_status is distinct from 'DRAFT' then
    raise exception 'Cannot change the plans of a published demand cycle' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end
$$;
create trigger demand_cycle_plans_lock before insert or update or delete on app.demand_cycle_plans
  for each row execute function app.tg_demand_cycle_plans_lock();

-- ------------------------------------------------------------ terms snapshots (immutable)
create table app.booking_terms_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  resident_id           uuid not null references app.resident_profiles (id) on delete restrict,
  flat_id               uuid not null references app.flats (id) on delete restrict,
  community_id          uuid not null references app.communities (id) on delete restrict,
  cluster_id            uuid references app.clusters (id) on delete restrict,
  catalogue_version_id  uuid not null references app.catalogue_versions (id) on delete restrict,
  plan_id               uuid not null references app.plans (id) on delete restrict,
  service_id            uuid references app.services (id) on delete restrict, -- null = complete package
  residence_category_id uuid not null references app.residence_categories (id) on delete restrict,
  plan_snapshot         jsonb not null,  -- name, validity, components, tasks, windows, add-ons
  total_paise           bigint not null check (total_paise > 0),
  tax_paise             bigint check (tax_paise is null or tax_paise >= 0), -- ADR-015: null, prices are tax-inclusive
  initial_pct           smallint check (initial_pct between 1 and 99), -- null = 100% (continuous / renewal)
  initial_due_paise     bigint not null check (initial_due_paise > 0),
  remaining_due_paise   bigint not null check (remaining_due_paise >= 0),
  currency              char(3) not null default 'INR',
  cycle_id              uuid references app.demand_cycles (id) on delete restrict,
  validity_days         integer not null check (validity_days between 1 and 366),
  disclosure_version    text,      -- ADR-013: non-refundable initial amount, accepted before paying
  disclosure_accepted_at timestamptz,
  created_at            timestamptz not null default now(),
  constraint snapshot_amounts check (initial_due_paise + remaining_due_paise = total_paise),
  constraint snapshot_disclosure check (initial_pct is null or (disclosure_version is not null and disclosure_accepted_at is not null))
);
create trigger booking_terms_snapshots_immutable before update or delete on app.booking_terms_snapshots
  for each row execute function app.tg_block_mutation();
create index snapshots_resident_idx on app.booking_terms_snapshots (resident_id);

-- ------------------------------------------------------------ demand requests
create table app.demand_requests (
  id                 uuid primary key default gen_random_uuid(),
  reference          text not null unique default ('DR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  cycle_id           uuid not null references app.demand_cycles (id) on delete restrict,
  resident_id        uuid not null references app.resident_profiles (id) on delete restrict,
  membership_id      uuid not null references app.residence_memberships (id) on delete restrict,
  flat_id            uuid not null references app.flats (id) on delete restrict,
  community_id       uuid not null references app.communities (id) on delete restrict,
  cluster_id         uuid references app.clusters (id) on delete restrict,
  terms_snapshot_id  uuid not null unique references app.booking_terms_snapshots (id) on delete restrict,
  status             text not null default 'AWAITING_PAYMENT'
                     check (status in ('AWAITING_PAYMENT', 'COMMITTED', 'BALANCE_DUE', 'CONVERTED', 'EXPIRED', 'CANCELLED', 'REVIEW_REQUIRED')),
  allocated_slot_id  uuid references app.slots (id) on delete restrict,
  initial_paid_paise bigint not null default 0 check (initial_paid_paise >= 0),
  committed_at       timestamptz,
  ended_at           timestamptz,
  end_reason         text,
  version            integer not null default 1,
  created_at         timestamptz not null default now(),
  created_by         uuid,
  updated_at         timestamptz not null default now(),
  updated_by         uuid
);
-- ADR-015: one active request per flat per cycle.
create unique index demand_requests_one_active_per_flat
  on app.demand_requests (cycle_id, flat_id) where status not in ('CANCELLED', 'EXPIRED');
create index demand_requests_cycle_idx on app.demand_requests (cycle_id, status);
create index demand_requests_slot_idx on app.demand_requests (allocated_slot_id) where allocated_slot_id is not null;

-- Preferred fixed time windows (no free-form days; RES-07B).
create table app.demand_request_preferences (
  request_id      uuid not null references app.demand_requests (id) on delete cascade,
  rank            smallint not null check (rank between 1 and 3),
  time_window_id  uuid not null references app.time_windows (id) on delete restrict,
  primary key (request_id, rank),
  unique (request_id, time_window_id)
);

-- ------------------------------------------------------------ bookings & subscriptions
create table app.bookings (
  id                      uuid primary key default gen_random_uuid(),
  reference               text not null unique default ('BK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  mode                    text not null check (mode in ('DEMAND_LED', 'CONTINUOUS')),
  demand_request_id       uuid unique references app.demand_requests (id) on delete restrict,
  resident_id             uuid not null references app.resident_profiles (id) on delete restrict,
  membership_id           uuid not null references app.residence_memberships (id) on delete restrict,
  flat_id                 uuid not null references app.flats (id) on delete restrict,
  community_id            uuid not null references app.communities (id) on delete restrict,
  cluster_id              uuid references app.clusters (id) on delete restrict,
  terms_snapshot_id       uuid not null references app.booking_terms_snapshots (id) on delete restrict,
  slot_id                 uuid not null references app.slots (id) on delete restrict,
  start_date              date not null,
  renews_subscription_id  uuid,  -- FK added after subscriptions
  status                  text not null default 'PENDING_PAYMENT'
                          check (status in ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'REVIEW_REQUIRED')),
  confirmed_at            timestamptz,
  ended_at                timestamptz,
  end_reason              text,
  version                 integer not null default 1,
  created_at              timestamptz not null default now(),
  created_by              uuid,
  updated_at              timestamptz not null default now(),
  updated_by              uuid
);
create index bookings_slot_idx on app.bookings (slot_id, status);
create index bookings_resident_idx on app.bookings (resident_id);
create index bookings_cluster_idx on app.bookings (cluster_id, status);

create table app.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  booking_id              uuid not null unique references app.bookings (id) on delete restrict,
  resident_id             uuid not null references app.resident_profiles (id) on delete restrict,
  flat_id                 uuid not null references app.flats (id) on delete restrict,
  community_id            uuid not null references app.communities (id) on delete restrict,
  cluster_id              uuid references app.clusters (id) on delete restrict,
  period_start            date not null,
  period_end              date not null,
  status                  text not null default 'PENDING_ACTIVATION'
                          check (status in ('PENDING_ACTIVATION', 'ACTIVE', 'ENDED', 'CANCELLED')),
  renews_subscription_id  uuid references app.subscriptions (id) on delete restrict,
  version                 integer not null default 1,
  created_at              timestamptz not null default now(),
  created_by              uuid,
  updated_at              timestamptz not null default now(),
  updated_by              uuid,
  constraint subscriptions_period check (period_end >= period_start)
);
create unique index subscriptions_one_renewal on app.subscriptions (renews_subscription_id) where renews_subscription_id is not null;
alter table app.bookings add constraint bookings_renews_fk foreign key (renews_subscription_id) references app.subscriptions (id) on delete restrict;
create index subscriptions_flat_idx on app.subscriptions (flat_id, status);

-- Copied from the snapshot so scheduling never reads mutable catalogue config.
create table app.subscription_components (
  id                uuid primary key default gen_random_uuid(),
  subscription_id   uuid not null references app.subscriptions (id) on delete restrict,
  cluster_id        uuid references app.clusters (id) on delete restrict,
  service_id        uuid not null references app.services (id) on delete restrict,
  start_time        time not null,
  duration_minutes  integer not null check (duration_minutes between 15 and 1440),
  days_of_week      smallint not null check (days_of_week between 1 and 127),
  visits_per_day    smallint not null check (visits_per_day between 1 and 6),
  is_addon          boolean not null default false,
  created_at        timestamptz not null default now()
);
create index subscription_components_sub_idx on app.subscription_components (subscription_id);

-- ------------------------------------------------------------ payments (ADR-006)
create table app.payment_orders (
  id                 uuid primary key default gen_random_uuid(),
  purpose            text not null check (purpose in ('INITIAL', 'BALANCE', 'FULL')),
  ref_type           text not null check (ref_type in ('DEMAND_REQUEST', 'BOOKING')),
  ref_id             uuid not null,
  resident_id        uuid not null references app.resident_profiles (id) on delete restrict,
  flat_id            uuid not null references app.flats (id) on delete restrict,
  community_id       uuid not null references app.communities (id) on delete restrict,
  cluster_id         uuid references app.clusters (id) on delete restrict,
  amount_paise       bigint not null check (amount_paise > 0),
  currency           char(3) not null default 'INR',
  provider           text not null default 'RAZORPAY',
  provider_order_id  text unique,
  idempotency_key    text not null unique,
  status             text not null default 'CREATED'
                     check (status in ('CREATED', 'PAID', 'FAILED', 'EXPIRED', 'REVIEW_REQUIRED')),
  expires_at         timestamptz not null,
  paid_at            timestamptz,
  version            integer not null default 1,
  created_at         timestamptz not null default now(),
  created_by         uuid,
  updated_at         timestamptz not null default now(),
  updated_by         uuid
);
create index payment_orders_ref_idx on app.payment_orders (ref_type, ref_id);
create index payment_orders_open_idx on app.payment_orders (expires_at) where status = 'CREATED';
-- At most one PAID order per purpose of a record.
create unique index payment_orders_one_paid_per_purpose on app.payment_orders (ref_type, ref_id, purpose) where status = 'PAID';

-- Raw provider evidence; append-only except processing bookkeeping (done by the system role).
create table app.provider_events (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null default 'RAZORPAY',
  event_id          text not null unique,
  event_type        text not null,
  payload           jsonb not null,
  signature_valid   boolean not null,
  received_at       timestamptz not null default now(),
  processed_at      timestamptz,
  processing_error  text
);

create table app.payment_transactions (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references app.payment_orders (id) on delete restrict,
  resident_id          uuid not null references app.resident_profiles (id) on delete restrict,
  cluster_id           uuid references app.clusters (id) on delete restrict,
  provider_payment_id  text not null unique, -- one provider payment -> one purpose
  amount_paise         bigint not null check (amount_paise > 0),
  currency             char(3) not null,
  method               text,
  status               text not null check (status in ('CAPTURED', 'REFUNDED', 'PARTIALLY_REFUNDED')),
  verified_via         text not null check (verified_via in ('CHECKOUT', 'WEBHOOK', 'RECONCILIATION')),
  verified_at          timestamptz not null default now()
);
create index payment_transactions_order_idx on app.payment_transactions (order_id);

-- ADR-013: approved by an admin with demand_payments:approve (+ reason); issued in the
-- Razorpay dashboard; the refund.processed webhook marks it PROCESSED.
create table app.refund_records (
  id                  uuid primary key default gen_random_uuid(),
  transaction_id      uuid not null references app.payment_transactions (id) on delete restrict,
  cluster_id          uuid references app.clusters (id) on delete restrict,
  amount_paise        bigint not null check (amount_paise > 0),
  reason              text,
  status              text not null default 'APPROVED' check (status in ('APPROVED', 'PROCESSED')),
  approved_by         uuid,
  approved_at         timestamptz,
  provider_refund_id  text unique,
  processed_at        timestamptz,
  created_at          timestamptz not null default now(),
  constraint refund_approval check (approved_by is null or reason is not null)
);
create index refund_records_tx_idx on app.refund_records (transaction_id);

create table app.payment_exceptions (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid references app.payment_orders (id) on delete restrict,
  transaction_id   uuid references app.payment_transactions (id) on delete restrict,
  cluster_id       uuid references app.clusters (id) on delete restrict,
  reason_code      text not null check (reason_code in (
                     'AMOUNT_MISMATCH', 'CURRENCY_MISMATCH', 'SLOT_UNAVAILABLE', 'CYCLE_CLOSED', 'DEADLINE_PASSED',
                     'DUPLICATE_PAYMENT', 'RECORD_NOT_PAYABLE', 'UNAPPROVED_REFUND', 'UNKNOWN_ORDER')),
  detail           text,
  status           text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED')),
  resolution_note  text,
  resolved_by      uuid,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index payment_exceptions_open_idx on app.payment_exceptions (status, created_at);

-- Stamping
create trigger slot_sets_stamp before insert or update on app.slot_sets for each row execute function app.tg_stamp();
create trigger slots_stamp before insert or update on app.slots for each row execute function app.tg_stamp();
create trigger demand_cycles_stamp before insert or update on app.demand_cycles for each row execute function app.tg_stamp();
create trigger demand_requests_stamp before insert or update on app.demand_requests for each row execute function app.tg_stamp();
create trigger bookings_stamp before insert or update on app.bookings for each row execute function app.tg_stamp();
create trigger subscriptions_stamp before insert or update on app.subscriptions for each row execute function app.tg_stamp();
create trigger payment_orders_stamp before insert or update on app.payment_orders for each row execute function app.tg_stamp();
create trigger payment_transactions_append_only before delete on app.payment_transactions
  for each row execute function app.tg_block_mutation();

-- ------------------------------------------------------------------ RLS
create or replace function app.claim_is_system() returns boolean
language sql stable
as $$ select app.claim_actor_kind() = 'system' $$;
grant execute on function app.claim_is_system() to app_api, app_worker;

-- Household-scoped rows: own rows, own verified household, admins in scope, system.
alter table app.booking_terms_snapshots enable row level security;
create policy snapshots_access on app.booking_terms_snapshots
  using (app.claim_is_resident(resident_id) or (app.claim_actor_kind() = 'resident' and flat_id = any (app.claim_household_flat_ids()))
         or app.claim_is_admin_in(cluster_id) or app.claim_is_system())
  with check (app.claim_is_resident(resident_id) or app.claim_is_admin_in(cluster_id) or app.claim_is_system());

alter table app.demand_requests enable row level security;
create policy demand_requests_access on app.demand_requests
  using (app.claim_is_resident(resident_id) or (app.claim_actor_kind() = 'resident' and flat_id = any (app.claim_household_flat_ids()))
         or app.claim_is_admin_in(cluster_id) or app.claim_is_system())
  with check (app.claim_is_resident(resident_id) or (app.claim_actor_kind() = 'resident' and flat_id = any (app.claim_household_flat_ids()))
              or app.claim_is_admin_in(cluster_id) or app.claim_is_system());

alter table app.demand_request_preferences enable row level security;
create policy demand_prefs_access on app.demand_request_preferences
  using (exists (select 1 from app.demand_requests r where r.id = demand_request_preferences.request_id))
  with check (exists (select 1 from app.demand_requests r where r.id = demand_request_preferences.request_id));

alter table app.bookings enable row level security;
create policy bookings_access on app.bookings
  using (app.claim_is_resident(resident_id) or (app.claim_actor_kind() = 'resident' and flat_id = any (app.claim_household_flat_ids()))
         or app.claim_is_admin_in(cluster_id) or app.claim_is_system())
  with check (app.claim_is_resident(resident_id) or (app.claim_actor_kind() = 'resident' and flat_id = any (app.claim_household_flat_ids()))
              or app.claim_is_admin_in(cluster_id) or app.claim_is_system());

alter table app.subscriptions enable row level security;
create policy subscriptions_access on app.subscriptions
  using ((app.claim_actor_kind() = 'resident' and flat_id = any (app.claim_household_flat_ids()))
         or app.claim_is_resident(resident_id) or app.claim_is_admin_in(cluster_id) or app.claim_is_system())
  with check (app.claim_is_admin_in(cluster_id) or app.claim_is_system());

alter table app.subscription_components enable row level security;
create policy subscription_components_access on app.subscription_components
  using (exists (select 1 from app.subscriptions s where s.id = subscription_components.subscription_id))
  with check (app.claim_is_admin_in(cluster_id) or app.claim_is_system());

alter table app.payment_orders enable row level security;
create policy payment_orders_access on app.payment_orders
  using (app.claim_is_resident(resident_id) or (app.claim_actor_kind() = 'resident' and flat_id = any (app.claim_household_flat_ids()))
         or app.claim_is_admin_in(cluster_id) or app.claim_is_system())
  with check (app.claim_is_resident(resident_id) or (app.claim_actor_kind() = 'resident' and flat_id = any (app.claim_household_flat_ids()))
              or app.claim_is_admin_in(cluster_id) or app.claim_is_system());

alter table app.payment_transactions enable row level security;
create policy payment_transactions_access on app.payment_transactions
  using (exists (select 1 from app.payment_orders o where o.id = payment_transactions.order_id))
  with check (app.claim_is_system() or app.claim_is_resident(resident_id));

alter table app.refund_records enable row level security;
create policy refund_records_access on app.refund_records
  using (exists (select 1 from app.payment_transactions t where t.id = refund_records.transaction_id))
  with check (app.claim_is_admin_in(cluster_id) or app.claim_is_system());

alter table app.payment_exceptions enable row level security;
create policy payment_exceptions_access on app.payment_exceptions
  using (app.claim_is_admin_in(cluster_id) or app.claim_is_system())
  with check (app.claim_is_admin_in(cluster_id) or app.claim_is_system());

-- ------------------------------------------------------------ privileges
grant select on app.app_settings to app_api, app_worker;
grant update on app.app_settings to app_api;
grant select, insert, update on app.slot_sets, app.slots, app.demand_cycles to app_api;
grant select, insert, delete on app.demand_cycle_plans to app_api;
grant select, insert on app.booking_terms_snapshots to app_api;
grant select, insert, update on app.demand_requests, app.bookings, app.subscriptions, app.payment_orders,
  app.payment_exceptions, app.refund_records to app_api;
grant select, insert, delete on app.demand_request_preferences to app_api;
grant select, insert on app.subscription_components to app_api;
grant select, insert, update on app.provider_events to app_api;
grant select, insert, update on app.payment_transactions to app_api; -- status only (refunds); DELETE blocked by trigger
