-- ============================================================================
-- Phase 5: workforce and allocation (EMP-01..05, EMP-09, ADM-09..11;
-- ADR-005 standing assignments, ADR-012 worker login).
--
-- Tier A (RLS; cluster scope + employee ownership): applicants, employees,
--   employee_verifications, employee_qualifications, employee_availability,
--   leave_requests, standing_assignments, service_occurrences,
--   occurrence_assignments, training_completions.
-- Tier B: verification_items, training_items.
-- No ranking/scoring and no capacity formula (OPEN, ADR-005): Operations picks
-- from the eligible list; eligibility filters are enforced on every save.
-- ============================================================================

create sequence app.employee_code_seq start 1;

insert into app.app_settings (key, value) values
  ('occurrence_horizon_days', '14'::jsonb),     -- rolling generation horizon [R]
  ('max_visits_per_employee_day', 'null'::jsonb) -- work limit; null = not configured (Operations to supply)
on conflict (key) do nothing;

-- ------------------------------------------------------------ applicants (EMP-01)
create table app.applicants (
  id                    uuid primary key default gen_random_uuid(),
  full_name             text not null check (length(trim(full_name)) between 2 and 120),
  phone                 text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  city                  text check (city is null or length(city) <= 80),
  preferred_cluster_id  uuid references app.clusters (id) on delete restrict,
  services              text[] not null default '{}',
  experience_note       text check (experience_note is null or length(experience_note) <= 1000),
  source                text not null default 'APP' check (source in ('APP', 'ADMIN')),
  status                text not null default 'NEW' check (status in ('NEW', 'IN_REVIEW', 'REJECTED', 'CONVERTED')),
  reviewed_by           uuid,
  review_note           text,
  version               integer not null default 1,
  created_at            timestamptz not null default now(),
  created_by            uuid,
  updated_at            timestamptz not null default now(),
  updated_by            uuid
);
-- Duplicate rule: one open application per phone.
create unique index applicants_one_open_per_phone on app.applicants (phone) where status in ('NEW', 'IN_REVIEW');

-- ------------------------------------------------------------ employees (ADM-09)
create table app.employees (
  id                      uuid primary key default gen_random_uuid(),
  employee_code           text not null unique default ('NV-' || lpad(nextval('app.employee_code_seq')::text, 6, '0')),
  auth_user_id            uuid unique references auth.users (id) on delete restrict,
  applicant_id            uuid unique references app.applicants (id) on delete restrict,
  full_name               text not null check (length(trim(full_name)) between 2 and 120),
  phone                   text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  home_cluster_id         uuid not null references app.clusters (id) on delete restrict,
  status                  text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE', 'EXITED')),
  readiness               text not null default 'NOT_READY' check (readiness in ('NOT_READY', 'READY')),
  readiness_note          text,
  joined_on               date,
  login_enabled_at        timestamptz,
  must_change_password    boolean not null default false,
  sessions_valid_after    timestamptz,  -- tokens issued before this are rejected (password reset)
  version                 integer not null default 1,
  created_at              timestamptz not null default now(),
  created_by              uuid,
  updated_at              timestamptz not null default now(),
  updated_by              uuid
);
create unique index employees_phone_active on app.employees (phone) where status <> 'EXITED';
create index employees_cluster_idx on app.employees (home_cluster_id, status, readiness);

-- HR-configured checklist (verification standards are client-owned, ADM-09).
create table app.verification_items (
  id        uuid primary key default gen_random_uuid(),
  name      text not null unique check (length(trim(name)) between 2 and 80),
  required  boolean not null default true,
  status    text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  sort      smallint not null default 0
);

create table app.employee_verifications (
  employee_id  uuid not null references app.employees (id) on delete restrict,
  item_id      uuid not null references app.verification_items (id) on delete restrict,
  cluster_id   uuid references app.clusters (id) on delete restrict,
  status       text not null check (status in ('PENDING', 'VERIFIED', 'REJECTED')),
  note         text check (note is null or length(note) <= 500),
  reviewed_by  uuid,
  reviewed_at  timestamptz not null default now(),
  primary key (employee_id, item_id)
);

create table app.employee_qualifications (
  employee_id  uuid not null references app.employees (id) on delete restrict,
  service_id   uuid not null references app.services (id) on delete restrict,
  cluster_id   uuid references app.clusters (id) on delete restrict,
  approved_by  uuid,
  approved_at  timestamptz not null default now(),
  primary key (employee_id, service_id)
);

-- Weekly availability windows (EMP-09). No rows = availability not restricted.
create table app.employee_availability (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references app.employees (id) on delete cascade,
  cluster_id    uuid references app.clusters (id) on delete restrict,
  days_of_week  smallint not null check (days_of_week between 1 and 127),
  start_time    time not null,
  end_time      time not null,
  constraint availability_order check (end_time > start_time)
);
create index employee_availability_emp_idx on app.employee_availability (employee_id);

create table app.leave_requests (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references app.employees (id) on delete restrict,
  cluster_id   uuid references app.clusters (id) on delete restrict,
  start_date   date not null,
  end_date     date not null,
  reason       text check (reason is null or length(reason) <= 500),
  status       text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  reviewed_by  uuid,
  reviewed_at  timestamptz,
  review_note  text,
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  created_by   uuid,
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  constraint leave_order check (end_date >= start_date)
);
create index leave_requests_emp_idx on app.leave_requests (employee_id, status, start_date);

-- Training links (EMP-04, minimal; no LMS).
create table app.training_items (
  id      uuid primary key default gen_random_uuid(),
  title   text not null check (length(trim(title)) between 2 and 120),
  url     text not null check (url ~ '^https://'),
  status  text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  sort    smallint not null default 0
);
create table app.training_completions (
  employee_id   uuid not null references app.employees (id) on delete restrict,
  item_id       uuid not null references app.training_items (id) on delete restrict,
  cluster_id    uuid references app.clusters (id) on delete restrict,
  completed_at  timestamptz not null default now(),
  primary key (employee_id, item_id)
);

-- ------------------------------------------------------------ allocation (ADM-11)
create table app.standing_assignments (
  id                         uuid primary key default gen_random_uuid(),
  subscription_component_id  uuid not null references app.subscription_components (id) on delete restrict,
  employee_id                uuid not null references app.employees (id) on delete restrict,
  cluster_id                 uuid references app.clusters (id) on delete restrict,
  effective_from             date not null,
  effective_to               date,
  status                     text not null default 'ACTIVE' check (status in ('ACTIVE', 'ENDED')),
  end_reason                 text,
  confirmed_by               uuid,
  created_at                 timestamptz not null default now(),
  constraint standing_dates check (effective_to is null or effective_to >= effective_from)
);
create unique index standing_one_active_per_component on app.standing_assignments (subscription_component_id) where status = 'ACTIVE';
create index standing_employee_idx on app.standing_assignments (employee_id, status);

create table app.service_occurrences (
  id                         uuid primary key default gen_random_uuid(),
  subscription_component_id  uuid not null references app.subscription_components (id) on delete restrict,
  subscription_id            uuid not null references app.subscriptions (id) on delete restrict,
  service_id                 uuid not null references app.services (id) on delete restrict,
  flat_id                    uuid not null references app.flats (id) on delete restrict,
  community_id               uuid not null references app.communities (id) on delete restrict,
  cluster_id                 uuid references app.clusters (id) on delete restrict,
  scheduled_date             date not null,
  visit_no                   smallint not null default 1 check (visit_no between 1 and 6),
  -- Visit 1 starts at the slot time. Further visits per day need a time set by Operations (OPEN).
  starts_at                  timestamptz,
  ends_at                    timestamptz,
  status                     text not null default 'SCHEDULED'
                             check (status in ('SCHEDULED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETION_SUBMITTED', 'COMPLETED', 'NO_SHOW', 'CANCELLED', 'EXCEPTION')),
  version                    integer not null default 1,
  created_at                 timestamptz not null default now(),
  created_by                 uuid,
  updated_at                 timestamptz not null default now(),
  updated_by                 uuid,
  unique (subscription_component_id, scheduled_date, visit_no),
  constraint occurrence_times check ((starts_at is null) = (ends_at is null) and (ends_at is null or ends_at > starts_at))
);
create index occurrences_cluster_date_idx on app.service_occurrences (cluster_id, scheduled_date, status);
create index occurrences_flat_idx on app.service_occurrences (flat_id, scheduled_date);

create table app.occurrence_assignments (
  id                      uuid primary key default gen_random_uuid(),
  occurrence_id           uuid not null references app.service_occurrences (id) on delete restrict,
  employee_id             uuid not null references app.employees (id) on delete restrict,
  cluster_id              uuid references app.clusters (id) on delete restrict,
  source                  text not null check (source in ('STANDING', 'MANUAL', 'REPLACEMENT')),
  replaced_assignment_id  uuid references app.occurrence_assignments (id) on delete restrict,
  status                  text not null default 'ACTIVE' check (status in ('ACTIVE', 'REPLACED', 'CANCELLED')),
  -- Copied from the occurrence for the overlap guard below.
  starts_at               timestamptz,
  ends_at                 timestamptz,
  assigned_by             uuid,
  reason                  text,
  created_at              timestamptz not null default now()
);
create unique index occurrence_one_active_assignment on app.occurrence_assignments (occurrence_id) where status = 'ACTIVE';
create index occurrence_assignments_emp_idx on app.occurrence_assignments (employee_id, status, starts_at);
-- No double-booked employee (the database is the last line of defence).
create extension if not exists btree_gist with schema extensions;
alter table app.occurrence_assignments add constraint occurrence_assignments_no_overlap
  exclude using gist (employee_id with =, tstzrange(starts_at, ends_at) with &&)
  where (status = 'ACTIVE' and starts_at is not null);

-- Stamping
create trigger applicants_stamp before insert or update on app.applicants for each row execute function app.tg_stamp();
create trigger employees_stamp before insert or update on app.employees for each row execute function app.tg_stamp();
create trigger leave_requests_stamp before insert or update on app.leave_requests for each row execute function app.tg_stamp();
create trigger service_occurrences_stamp before insert or update on app.service_occurrences for each row execute function app.tg_stamp();

-- ------------------------------------------------------------------ RLS
-- The calling employee's id (employee sessions carry the employee id as app.user_id).
create or replace function app.claim_is_employee(eid uuid) returns boolean
language sql stable
as $$ select app.claim_actor_kind() = 'employee' and eid = app.claim_user_id() $$;
grant execute on function app.claim_is_employee(uuid) to app_api, app_worker;

alter table app.applicants enable row level security;
create policy applicants_access on app.applicants
  using (app.claim_actor_kind() = 'admin' and (app.claim_has_cluster(preferred_cluster_id) or preferred_cluster_id is null and app.claim_has_cluster(null)))
  with check (app.claim_actor_kind() in ('admin', 'public', 'system'));

alter table app.employees enable row level security;
create policy employees_access on app.employees
  using (app.claim_is_employee(id) or app.claim_is_admin_in(home_cluster_id) or app.claim_is_system())
  with check (app.claim_is_employee(id) or app.claim_is_admin_in(home_cluster_id) or app.claim_is_system());

alter table app.employee_verifications enable row level security;
create policy employee_verifications_access on app.employee_verifications
  using (app.claim_is_employee(employee_id) or app.claim_is_admin_in(cluster_id))
  with check (app.claim_is_admin_in(cluster_id));

alter table app.employee_qualifications enable row level security;
create policy employee_qualifications_access on app.employee_qualifications
  using (app.claim_is_employee(employee_id) or app.claim_is_admin_in(cluster_id) or app.claim_is_system())
  with check (app.claim_is_admin_in(cluster_id));

alter table app.employee_availability enable row level security;
create policy employee_availability_access on app.employee_availability
  using (app.claim_is_employee(employee_id) or app.claim_is_admin_in(cluster_id) or app.claim_is_system())
  with check (app.claim_is_employee(employee_id) or app.claim_is_admin_in(cluster_id));

alter table app.leave_requests enable row level security;
create policy leave_requests_access on app.leave_requests
  using (app.claim_is_employee(employee_id) or app.claim_is_admin_in(cluster_id) or app.claim_is_system())
  with check (app.claim_is_employee(employee_id) or app.claim_is_admin_in(cluster_id));

alter table app.training_completions enable row level security;
create policy training_completions_access on app.training_completions
  using (app.claim_is_employee(employee_id) or app.claim_is_admin_in(cluster_id))
  with check (app.claim_is_employee(employee_id));

alter table app.standing_assignments enable row level security;
create policy standing_assignments_access on app.standing_assignments
  using (app.claim_is_employee(employee_id) or app.claim_is_admin_in(cluster_id) or app.claim_is_system())
  with check (app.claim_is_admin_in(cluster_id) or app.claim_is_system());

-- Occurrences: admins in scope, the household, the assigned employee, system.
create or replace function app.claim_employee_occurrence_ids() returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(a.occurrence_id), '{}')
    from app.occurrence_assignments a
   where app.claim_actor_kind() = 'employee' and a.employee_id = app.claim_user_id() and a.status = 'ACTIVE'
$$;
revoke all on function app.claim_employee_occurrence_ids() from public;
grant execute on function app.claim_employee_occurrence_ids() to app_api, app_worker;

alter table app.service_occurrences enable row level security;
create policy service_occurrences_access on app.service_occurrences
  using (app.claim_is_admin_in(cluster_id) or app.claim_is_system()
         or (app.claim_actor_kind() = 'resident' and flat_id = any (app.claim_household_flat_ids()))
         or id = any (app.claim_employee_occurrence_ids()))
  with check (app.claim_is_admin_in(cluster_id) or app.claim_is_system() or id = any (app.claim_employee_occurrence_ids()));

alter table app.occurrence_assignments enable row level security;
create policy occurrence_assignments_access on app.occurrence_assignments
  using (app.claim_is_employee(employee_id) or app.claim_is_admin_in(cluster_id) or app.claim_is_system())
  with check (app.claim_is_admin_in(cluster_id) or app.claim_is_system());

-- ------------------------------------------------------------ privileges
grant usage on sequence app.employee_code_seq to app_api;
grant select, insert, update on app.applicants, app.employees, app.leave_requests, app.service_occurrences to app_api;
grant select, insert, update on app.verification_items, app.training_items to app_api;
grant select, insert, update, delete on app.employee_verifications, app.employee_qualifications, app.employee_availability to app_api;
grant select, insert on app.training_completions to app_api;
grant select, insert, update on app.standing_assignments, app.occurrence_assignments to app_api;
