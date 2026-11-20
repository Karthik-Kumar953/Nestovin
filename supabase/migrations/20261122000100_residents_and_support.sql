-- ============================================================================
-- Phase 3: residents, households, documents and support tickets
-- (RES-01..05, RES-12, ADM-05, ADM-06, ADM-13; ADR-001, ADR-012)
--
-- All tables here are Tier A: RLS policy + CI test each. Policies combine:
--   * resident ownership (own rows, own household via verified flat)
--   * admin cluster scope (app.claim_has_cluster(cluster_id))
-- Module/action permissions stay in the API. Clients never reach these tables.
-- ============================================================================

-- ------------------------------------------------------------ residents
create table app.resident_profiles (
  id          uuid primary key references auth.users (id) on delete restrict,
  phone       text not null unique check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  full_name   text check (full_name is null or length(trim(full_name)) between 1 and 120),
  email       extensions.citext,
  status      text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED')),
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

create table app.residence_memberships (
  id                     uuid primary key default gen_random_uuid(),
  resident_id            uuid not null references app.resident_profiles (id) on delete restrict,
  flat_id                uuid not null references app.flats (id) on delete restrict,
  -- Scope copied at creation (ADR-001): history keeps the scope that applied then.
  community_id           uuid not null references app.communities (id) on delete restrict,
  cluster_id             uuid references app.clusters (id) on delete restrict,
  kind                   text not null check (kind in ('PRIMARY', 'FAMILY')),
  occupancy              text not null check (occupancy in ('OWNER', 'TENANT', 'FAMILY')),
  status                 text not null default 'PENDING'
                         check (status in ('PENDING', 'VERIFIED', 'REJECTED', 'REVOKED', 'ENDED')),
  primary_membership_id  uuid references app.residence_memberships (id) on delete restrict,
  verified_at            timestamptz,
  verified_by            uuid,
  ended_at               timestamptz,
  end_reason             text,
  version                integer not null default 1,
  created_at             timestamptz not null default now(),
  created_by             uuid,
  updated_at             timestamptz not null default now(),
  updated_by             uuid,
  constraint memberships_family_link check ((kind = 'FAMILY') = (primary_membership_id is not null))
);
-- The first verified resident of a flat is its Primary; only one at a time.
create unique index memberships_one_verified_primary_per_flat
  on app.residence_memberships (flat_id) where kind = 'PRIMARY' and status = 'VERIFIED';
-- V1: one active residence context per resident.
create unique index memberships_one_active_per_resident
  on app.residence_memberships (resident_id) where status in ('PENDING', 'VERIFIED');
create index memberships_cluster_idx on app.residence_memberships (cluster_id, status);
create index memberships_flat_idx on app.residence_memberships (flat_id);

-- Fill community/cluster from the flat on insert (never trusted from the caller).
create or replace function app.tg_membership_scope() returns trigger
language plpgsql
as $$
begin
  select f.community_id, m.cluster_id
    into new.community_id, new.cluster_id
    from app.flats f
    left join app.cluster_community_memberships m on m.community_id = f.community_id and m.effective_to is null
   where f.id = new.flat_id;
  if new.community_id is null then
    raise exception 'Flat % does not exist', new.flat_id using errcode = 'foreign_key_violation';
  end if;
  return new;
end
$$;
create trigger memberships_scope before insert on app.residence_memberships
  for each row execute function app.tg_membership_scope();

-- ------------------------------------------------------------ documents
create table app.documents (
  id             uuid primary key default gen_random_uuid(),
  owner_type     text not null check (owner_type in ('RESIDENCE_VERIFICATION')),
  owner_id       uuid not null,
  doc_type       text not null check (doc_type in ('OWNERSHIP_PROOF', 'RENT_AGREEMENT', 'ELECTRICITY_BILL', 'SOCIETY_ID')),
  bucket         text not null,
  storage_key    text not null unique,
  file_name      text not null check (length(file_name) between 1 and 255),
  mime_type      text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes     integer check (size_bytes is null or size_bytes between 1 and 5242880),
  status         text not null default 'PENDING_UPLOAD' check (status in ('PENDING_UPLOAD', 'UPLOADED')),
  uploaded_by    uuid not null,
  community_id   uuid not null references app.communities (id) on delete restrict,
  cluster_id     uuid references app.clusters (id) on delete restrict,
  created_at     timestamptz not null default now(),
  uploaded_at    timestamptz
);
create index documents_owner_idx on app.documents (owner_type, owner_id);

-- Private bucket for residence documents (5 MB, PDF/JPEG/PNG only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resident-documents', 'resident-documents', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- ------------------------------------------- residence verification requests
create table app.residence_verification_requests (
  id             uuid primary key default gen_random_uuid(),
  membership_id  uuid not null unique references app.residence_memberships (id) on delete restrict,
  document_id    uuid not null references app.documents (id) on delete restrict,
  community_id   uuid not null references app.communities (id) on delete restrict,
  cluster_id     uuid references app.clusters (id) on delete restrict,
  decision       text not null default 'PENDING' check (decision in ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by    uuid,
  reviewed_at    timestamptz,
  reason         text,
  created_at     timestamptz not null default now(),
  constraint verification_decided check ((decision = 'PENDING') = (reviewed_at is null)),
  constraint verification_reject_reason check (decision <> 'REJECTED' or length(trim(reason)) >= 3)
);
create index verification_queue_idx on app.residence_verification_requests (cluster_id, decision, created_at);

-- ------------------------------------------------ family access requests
create table app.family_access_requests (
  id                        uuid primary key default gen_random_uuid(),
  primary_membership_id     uuid not null references app.residence_memberships (id) on delete restrict,
  requested_by              uuid not null references app.resident_profiles (id) on delete restrict,
  phone                     text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  full_name                 text not null check (length(trim(full_name)) between 2 and 120),
  relationship              text not null check (length(trim(relationship)) between 2 and 40),
  community_id              uuid not null references app.communities (id) on delete restrict,
  cluster_id                uuid references app.clusters (id) on delete restrict,
  status                    text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  physical_verification_at  timestamptz,
  reviewed_by               uuid,
  reviewed_at               timestamptz,
  reason                    text,
  resulting_membership_id   uuid references app.residence_memberships (id) on delete restrict,
  created_at                timestamptz not null default now(),
  constraint family_approval_needs_physical check (status <> 'APPROVED' or physical_verification_at is not null),
  constraint family_reject_reason check (status <> 'REJECTED' or length(trim(reason)) >= 3)
);
-- One open request per phone per household.
create unique index family_requests_one_pending
  on app.family_access_requests (primary_membership_id, phone) where status = 'PENDING';
create index family_requests_queue_idx on app.family_access_requests (cluster_id, status, created_at);
create index family_requests_phone_idx on app.family_access_requests (phone) where status = 'APPROVED';

-- ------------------------------------------------------------- support
create table app.ticket_categories (
  id      uuid primary key default gen_random_uuid(),
  name    text not null check (length(trim(name)) between 2 and 60),
  status  text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  sort    smallint not null default 0
);
create unique index ticket_categories_name_uq on app.ticket_categories (lower(name));
insert into app.ticket_categories (name, sort) values
  ('Service quality', 1), ('Payment', 2), ('Schedule', 3), ('Account', 4), ('Other', 9);

create sequence app.ticket_reference_seq;

create table app.support_tickets (
  id              uuid primary key default gen_random_uuid(),
  reference       text not null unique
                  default ('TKT-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('app.ticket_reference_seq')::text, 5, '0')),
  resident_id     uuid not null references app.resident_profiles (id) on delete restrict,
  membership_id   uuid references app.residence_memberships (id) on delete restrict,
  flat_id         uuid references app.flats (id) on delete restrict,
  community_id    uuid references app.communities (id) on delete restrict,
  cluster_id      uuid references app.clusters (id) on delete restrict,
  category_id     uuid not null references app.ticket_categories (id) on delete restrict,
  subject         text not null check (length(trim(subject)) between 3 and 140),
  description     text not null check (length(trim(description)) between 5 and 4000),
  priority        text not null default 'NORMAL' check (priority in ('LOW', 'NORMAL', 'HIGH')),
  urgent          boolean not null default false,
  status          text not null default 'OPEN'
                  check (status in ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED')),
  owner_admin_id  uuid,
  due_at          timestamptz,
  resolved_at     timestamptz,
  closed_at       timestamptz,
  version         integer not null default 1,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  updated_by      uuid
);
create index tickets_queue_idx on app.support_tickets (cluster_id, status, created_at desc);
create index tickets_resident_idx on app.support_tickets (resident_id, created_at desc);
create index tickets_flat_idx on app.support_tickets (flat_id, created_at desc);

create table app.ticket_updates (
  id           bigint generated always as identity primary key,
  ticket_id    uuid not null references app.support_tickets (id) on delete restrict,
  author_kind  text not null check (author_kind in ('admin', 'resident', 'system')),
  author_id    uuid,
  visibility   text not null check (visibility in ('INTERNAL', 'RESIDENT')),
  body         text not null check (length(trim(body)) between 1 and 4000),
  created_at   timestamptz not null default now(),
  constraint resident_updates_are_visible check (author_kind <> 'resident' or visibility = 'RESIDENT')
);
create index ticket_updates_ticket_idx on app.ticket_updates (ticket_id, created_at);
create trigger ticket_updates_append_only before update or delete on app.ticket_updates
  for each row execute function app.tg_block_mutation();

-- Stamping
create trigger resident_profiles_stamp before insert or update on app.resident_profiles
  for each row execute function app.tg_stamp();
create trigger residence_memberships_stamp before insert or update on app.residence_memberships
  for each row execute function app.tg_stamp();
create trigger support_tickets_stamp before insert or update on app.support_tickets
  for each row execute function app.tg_stamp();

-- ------------------------------------------------------------------ RLS
-- Flats on which the calling resident has a VERIFIED membership (their household).
-- SECURITY DEFINER so policies on residence_memberships can use it without recursion.
create or replace function app.claim_household_flat_ids() returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(m.flat_id), '{}')
    from app.residence_memberships m
   where app.claim_actor_kind() = 'resident'
     and m.resident_id = app.claim_user_id()
     and m.status = 'VERIFIED'
$$;
revoke all on function app.claim_household_flat_ids() from public;
grant execute on function app.claim_household_flat_ids() to app_api, app_worker;

create or replace function app.claim_is_admin_in(cluster uuid) returns boolean
language sql stable
as $$ select app.claim_actor_kind() = 'admin' and app.claim_has_cluster(cluster) $$;
grant execute on function app.claim_is_admin_in(uuid) to app_api, app_worker;

create or replace function app.claim_is_resident(uid uuid) returns boolean
language sql stable
as $$ select app.claim_actor_kind() = 'resident' and uid = app.claim_user_id() $$;
grant execute on function app.claim_is_resident(uuid) to app_api, app_worker;

alter table app.resident_profiles enable row level security;
alter table app.residence_memberships enable row level security;
alter table app.documents enable row level security;
alter table app.residence_verification_requests enable row level security;
alter table app.family_access_requests enable row level security;
alter table app.support_tickets enable row level security;
alter table app.ticket_updates enable row level security;

-- Profiles: self; household members (names of family); admins who can see any of
-- the resident's memberships, or global-scope admins (new sign-ups without a flat).
create policy resident_profiles_access on app.resident_profiles
  using (
    app.claim_is_resident(id)
    or (app.claim_actor_kind() = 'resident' and exists (
          select 1 from app.residence_memberships m
           where m.resident_id = resident_profiles.id
             and m.flat_id = any (app.claim_household_flat_ids())
             and m.status in ('PENDING', 'VERIFIED')))
    or (app.claim_actor_kind() = 'admin' and (
          app.claim_has_cluster(null)
          or exists (select 1 from app.residence_memberships m where m.resident_id = resident_profiles.id)))
  )
  with check (app.claim_is_resident(id) or app.claim_actor_kind() = 'admin');

create policy memberships_access on app.residence_memberships
  using (
    app.claim_is_resident(resident_id)
    or (app.claim_actor_kind() = 'resident' and flat_id = any (app.claim_household_flat_ids())
        and status in ('PENDING', 'VERIFIED'))
    or app.claim_is_admin_in(cluster_id)
  )
  with check (app.claim_is_resident(resident_id) or app.claim_is_admin_in(cluster_id)
              or (app.claim_actor_kind() = 'resident' and flat_id = any (app.claim_household_flat_ids())));

create policy documents_access on app.documents
  using (app.claim_is_resident(uploaded_by) or app.claim_is_admin_in(cluster_id))
  with check (app.claim_is_resident(uploaded_by) or app.claim_is_admin_in(cluster_id));

create policy verification_access on app.residence_verification_requests
  using (
    app.claim_is_admin_in(cluster_id)
    or exists (select 1 from app.residence_memberships m
                where m.id = residence_verification_requests.membership_id and app.claim_is_resident(m.resident_id))
  )
  with check (
    app.claim_is_admin_in(cluster_id)
    or exists (select 1 from app.residence_memberships m
                where m.id = residence_verification_requests.membership_id and app.claim_is_resident(m.resident_id))
  );

create policy family_requests_access on app.family_access_requests
  using (app.claim_is_resident(requested_by) or app.claim_is_admin_in(cluster_id))
  with check (app.claim_is_resident(requested_by) or app.claim_is_admin_in(cluster_id));

create policy tickets_access on app.support_tickets
  using (
    app.claim_is_resident(resident_id)
    or (app.claim_actor_kind() = 'resident' and flat_id = any (app.claim_household_flat_ids()))
    or app.claim_is_admin_in(cluster_id)
  )
  with check (app.claim_is_resident(resident_id) or app.claim_is_admin_in(cluster_id));

-- Residents never see INTERNAL notes.
create policy ticket_updates_access on app.ticket_updates
  using (
    exists (select 1 from app.support_tickets t where t.id = ticket_updates.ticket_id)
    and (app.claim_actor_kind() = 'admin' or visibility = 'RESIDENT')
  )
  with check (
    exists (select 1 from app.support_tickets t where t.id = ticket_updates.ticket_id)
    and (app.claim_actor_kind() = 'admin' or (visibility = 'RESIDENT' and author_kind = 'resident'))
  );

-- ------------------------------------------------------------ privileges
grant select, insert, update on app.resident_profiles, app.residence_memberships, app.documents,
  app.residence_verification_requests, app.family_access_requests, app.support_tickets to app_api;
grant select, insert on app.ticket_updates to app_api;
grant select, insert, update on app.ticket_categories to app_api;
grant usage on sequence app.ticket_reference_seq to app_api;
grant select on app.ticket_categories to app_worker;
