-- EMP-08 additional work / overtime (client-confirmed flow): Operations offers a
-- visit to one or more eligible workers; workers accept or reject; an admin
-- confirms one acceptance, which creates the schedule entry. Acceptance alone
-- is not an assignment. Pay rate, expiry and maximum hours are OPEN: confirmed
-- overtime is a payroll input that Finance prices via an authorised entry.
alter table app.occurrence_assignments drop constraint occurrence_assignments_source_check;
alter table app.occurrence_assignments add constraint occurrence_assignments_source_check
  check (source in ('STANDING', 'MANUAL', 'REPLACEMENT', 'OVERTIME'));

create table app.overtime_offers (
  id             uuid primary key default gen_random_uuid(),
  occurrence_id  uuid not null references app.service_occurrences (id) on delete restrict,
  cluster_id     uuid references app.clusters (id) on delete restrict,
  note           text check (note is null or length(note) <= 500),
  status         text not null default 'OPEN' check (status in ('OPEN', 'FILLED', 'CANCELLED')),
  confirmed_employee_id uuid references app.employees (id) on delete restrict,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  closed_at      timestamptz
);
create unique index overtime_one_open_per_visit on app.overtime_offers (occurrence_id) where status = 'OPEN';
create index overtime_offers_cluster_idx on app.overtime_offers (cluster_id, status);

create table app.overtime_offer_responses (
  offer_id      uuid not null references app.overtime_offers (id) on delete restrict,
  employee_id   uuid not null references app.employees (id) on delete restrict,
  cluster_id    uuid references app.clusters (id) on delete restrict,
  response      text not null default 'PENDING' check (response in ('PENDING', 'ACCEPTED', 'REJECTED')),
  responded_at  timestamptz,
  primary key (offer_id, employee_id)
);
create index overtime_responses_employee_idx on app.overtime_offer_responses (employee_id, response);

alter table app.overtime_offers enable row level security;
create policy overtime_offers_access on app.overtime_offers
  using (app.claim_is_admin_in(cluster_id)
         or exists (select 1 from app.overtime_offer_responses r where r.offer_id = overtime_offers.id and app.claim_is_employee(r.employee_id)))
  with check (app.claim_is_admin_in(cluster_id));

alter table app.overtime_offer_responses enable row level security;
create policy overtime_responses_access on app.overtime_offer_responses
  using (app.claim_is_admin_in(cluster_id) or app.claim_is_employee(employee_id))
  with check (app.claim_is_admin_in(cluster_id) or app.claim_is_employee(employee_id));

grant select, insert, update on app.overtime_offers, app.overtime_offer_responses to app_api;
