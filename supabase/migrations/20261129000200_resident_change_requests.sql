-- RES-14: changes to verified residence data are requested and reviewed, never
-- silently overwritten. V1 types: occupancy change and move-out (moving flats =
-- move out, then register the new flat). Name/email remain self-service.
create table app.resident_change_requests (
  id             uuid primary key default gen_random_uuid(),
  resident_id    uuid not null references app.resident_profiles (id) on delete restrict,
  membership_id  uuid not null references app.residence_memberships (id) on delete restrict,
  flat_id        uuid not null references app.flats (id) on delete restrict,
  community_id   uuid not null references app.communities (id) on delete restrict,
  cluster_id     uuid references app.clusters (id) on delete restrict,
  kind           text not null check (kind in ('OCCUPANCY_CHANGE', 'MOVE_OUT')),
  requested      jsonb not null default '{}'::jsonb,
  reason         text check (reason is null or length(reason) <= 500),
  status         text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  reviewed_by    uuid,
  reviewed_at    timestamptz,
  review_note    text,
  created_at     timestamptz not null default now()
);
create unique index change_requests_one_pending on app.resident_change_requests (membership_id, kind) where status = 'PENDING';
create index change_requests_resident_idx on app.resident_change_requests (resident_id);
create index change_requests_cluster_idx on app.resident_change_requests (cluster_id, status);

alter table app.resident_change_requests enable row level security;
create policy change_requests_access on app.resident_change_requests
  using (app.claim_is_resident(resident_id) or app.claim_is_admin_in(cluster_id))
  with check (app.claim_is_resident(resident_id) or app.claim_is_admin_in(cluster_id));

grant select, insert, update on app.resident_change_requests to app_api;
