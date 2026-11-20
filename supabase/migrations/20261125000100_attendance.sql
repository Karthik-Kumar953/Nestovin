-- ============================================================================
-- Phase 6: attendance and service records (EMP-06/07, RES-10/11, ADM-12/12A;
-- ADR-014: resident OTP or rotating QR; 200 m geofence flags, never blocks).
--
-- Tier A (RLS): attendance_challenges, attendance_events, service_completions,
--   no_show_records, attendance_corrections, visit_feedback.
-- Location is captured only at the verification event (no live tracking).
-- Entitlement deduction for no-shows stays OPEN (OPN-22): outcomes are recorded only.
-- ============================================================================

alter table app.communities add column geofence_radius_m integer not null default 200 check (geofence_radius_m between 25 and 5000);

insert into app.app_settings (key, value) values
  ('attendance_code_ttl_minutes', '10'::jsonb),     -- how long a resident code/QR stays valid
  ('gps_accuracy_threshold_m', 'null'::jsonb),      -- OPEN: flag low accuracy once a value is approved
  ('resident_no_show_wait_minutes', '15'::jsonb)    -- confirmed SOW rule
on conflict (key) do nothing;

-- Resident-side code for a visit: 6-digit OTP (hash only) and a QR nonce (hash only).
create table app.attendance_challenges (
  id             uuid primary key default gen_random_uuid(),
  occurrence_id  uuid not null references app.service_occurrences (id) on delete restrict,
  flat_id        uuid not null references app.flats (id) on delete restrict,
  cluster_id     uuid references app.clusters (id) on delete restrict,
  otp_hash       text not null,
  qr_hash        text not null,
  issued_to      uuid not null references app.resident_profiles (id) on delete restrict,
  expires_at     timestamptz not null,
  used_at        timestamptz,
  failed_attempts smallint not null default 0,
  created_at     timestamptz not null default now()
);
create index attendance_challenges_occ_idx on app.attendance_challenges (occurrence_id, created_at desc);

-- Append-only attendance evidence.
create table app.attendance_events (
  id               uuid primary key default gen_random_uuid(),
  occurrence_id    uuid not null references app.service_occurrences (id) on delete restrict,
  employee_id      uuid not null references app.employees (id) on delete restrict,
  cluster_id       uuid references app.clusters (id) on delete restrict,
  kind             text not null check (kind in ('CHECK_IN')),
  method           text not null check (method in ('OTP', 'QR')),
  result           text not null check (result in ('VERIFIED', 'REJECTED')),
  reject_reason    text,
  flags            text[] not null default '{}',   -- OUTSIDE_RADIUS, LOW_ACCURACY, NO_LOCATION, LATE
  lat              numeric(9, 6),
  lng              numeric(9, 6),
  accuracy_m       numeric(8, 1),
  distance_m       integer,
  device_time      timestamptz,
  client_event_id  text not null,
  server_time      timestamptz not null default now(),
  review_status    text not null default 'NONE' check (review_status in ('NONE', 'OPEN', 'ACCEPTED', 'REJECTED')),
  reviewed_by      uuid,
  review_note      text,
  unique (employee_id, client_event_id)
);
create index attendance_events_occ_idx on app.attendance_events (occurrence_id);
create index attendance_events_review_idx on app.attendance_events (cluster_id, review_status);
-- Evidence is immutable; only the admin review fields may change.
create or replace function app.tg_attendance_event_guard() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Attendance events cannot be deleted' using errcode = 'check_violation';
  end if;
  if (new.occurrence_id, new.employee_id, new.kind, new.method, new.result, new.flags, new.lat, new.lng, new.accuracy_m, new.distance_m, new.server_time, new.client_event_id)
     is distinct from
     (old.occurrence_id, old.employee_id, old.kind, old.method, old.result, old.flags, old.lat, old.lng, old.accuracy_m, old.distance_m, old.server_time, old.client_event_id) then
    raise exception 'Attendance evidence cannot be changed; record a correction instead' using errcode = 'check_violation';
  end if;
  return new;
end
$$;
create trigger attendance_events_guard before update or delete on app.attendance_events
  for each row execute function app.tg_attendance_event_guard();

create table app.service_completions (
  occurrence_id  uuid primary key references app.service_occurrences (id) on delete restrict,
  employee_id    uuid not null references app.employees (id) on delete restrict,
  cluster_id     uuid references app.clusters (id) on delete restrict,
  flat_id        uuid not null references app.flats (id) on delete restrict,
  note           text check (note is null or length(note) <= 1000),
  completed_at   timestamptz not null default now()
);

create table app.no_show_records (
  id             uuid primary key default gen_random_uuid(),
  occurrence_id  uuid not null unique references app.service_occurrences (id) on delete restrict,
  cluster_id     uuid references app.clusters (id) on delete restrict,
  flat_id        uuid not null references app.flats (id) on delete restrict,
  kind           text not null check (kind in ('RESIDENT_ABSENT', 'WORKER_ABSENT')),
  recorded_by_kind text not null check (recorded_by_kind in ('employee', 'admin')),
  recorded_by    uuid not null,
  employee_id    uuid references app.employees (id) on delete restrict,
  note           text,
  lat            numeric(9, 6),
  lng            numeric(9, 6),
  created_at     timestamptz not null default now()
);

-- ADM-12A: the original event is preserved; the correction is a separate record.
create table app.attendance_corrections (
  id                 uuid primary key default gen_random_uuid(),
  occurrence_id      uuid not null references app.service_occurrences (id) on delete restrict,
  employee_id        uuid not null references app.employees (id) on delete restrict,
  cluster_id         uuid references app.clusters (id) on delete restrict,
  original_event_id  uuid references app.attendance_events (id) on delete restrict,
  requested_change   text not null check (requested_change in ('MARK_ATTENDED', 'MARK_COMPLETED')),
  explanation        text not null check (length(trim(explanation)) between 5 and 1000),
  status             text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by        uuid,
  reviewed_at        timestamptz,
  review_note        text,
  created_at         timestamptz not null default now()
);
create unique index corrections_one_pending on app.attendance_corrections (occurrence_id) where status = 'PENDING';

create table app.visit_feedback (
  occurrence_id  uuid primary key references app.service_occurrences (id) on delete restrict,
  resident_id    uuid not null references app.resident_profiles (id) on delete restrict,
  flat_id        uuid not null references app.flats (id) on delete restrict,
  cluster_id     uuid references app.clusters (id) on delete restrict,
  employee_id    uuid references app.employees (id) on delete restrict,
  rating         smallint not null check (rating between 1 and 5),
  comment        text check (comment is null or length(comment) <= 1000),
  created_at     timestamptz not null default now()
);

-- ------------------------------------------------------------------ RLS
alter table app.attendance_challenges enable row level security;
create policy attendance_challenges_access on app.attendance_challenges
  using (app.claim_is_resident(issued_to) or (app.claim_actor_kind() = 'resident' and flat_id = any (app.claim_household_flat_ids()))
         or app.claim_is_system() or occurrence_id = any (app.claim_employee_occurrence_ids()))
  with check (app.claim_is_resident(issued_to) or app.claim_is_system() or occurrence_id = any (app.claim_employee_occurrence_ids()));

alter table app.attendance_events enable row level security;
create policy attendance_events_access on app.attendance_events
  using (app.claim_is_employee(employee_id) or app.claim_is_admin_in(cluster_id) or app.claim_is_system())
  with check (app.claim_is_employee(employee_id) or app.claim_is_admin_in(cluster_id) or app.claim_is_system());

alter table app.service_completions enable row level security;
create policy service_completions_access on app.service_completions
  using (app.claim_is_employee(employee_id) or app.claim_is_admin_in(cluster_id)
         or (app.claim_actor_kind() = 'resident' and flat_id = any (app.claim_household_flat_ids())))
  with check (app.claim_is_employee(employee_id) or app.claim_is_admin_in(cluster_id));

alter table app.no_show_records enable row level security;
create policy no_show_records_access on app.no_show_records
  using (app.claim_is_admin_in(cluster_id) or app.claim_is_employee(employee_id)
         or (app.claim_actor_kind() = 'resident' and flat_id = any (app.claim_household_flat_ids())))
  with check (app.claim_is_admin_in(cluster_id) or app.claim_is_employee(employee_id));

alter table app.attendance_corrections enable row level security;
create policy attendance_corrections_access on app.attendance_corrections
  using (app.claim_is_employee(employee_id) or app.claim_is_admin_in(cluster_id))
  with check (app.claim_is_employee(employee_id) or app.claim_is_admin_in(cluster_id));

alter table app.visit_feedback enable row level security;
create policy visit_feedback_access on app.visit_feedback
  using (app.claim_is_admin_in(cluster_id) or (app.claim_actor_kind() = 'resident' and flat_id = any (app.claim_household_flat_ids())))
  with check (app.claim_is_resident(resident_id) and flat_id = any (app.claim_household_flat_ids()));

-- ------------------------------------------------------------ privileges
grant select, insert, update on app.attendance_challenges to app_api;
grant select, insert, update on app.attendance_events to app_api;  -- UPDATE limited to review fields by trigger
grant select, insert on app.service_completions, app.no_show_records, app.visit_feedback to app_api;
grant select, insert, update on app.attendance_corrections to app_api;
