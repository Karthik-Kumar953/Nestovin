-- ============================================================================
-- Location master data (ADM-03)
--   Physical:    City -> Community -> Tower/Building -> Flat
--   Operational: Cluster -> one or more Communities (one cluster per community
--                at a time; history kept in cluster_community_memberships)
-- Tier B tables: protected by backend authorisation + DB privileges (no RLS).
-- ============================================================================

create table app.cities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 120),
  state       text not null check (length(trim(state)) between 1 and 120),
  status      text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
create unique index cities_name_state_uq on app.cities (lower(name), lower(state));

create table app.clusters (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) between 1 and 120),
  code         text not null check (length(trim(code)) between 1 and 40),
  description  text,
  status       text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  created_by   uuid,
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);
create unique index clusters_code_uq on app.clusters (lower(code));
create unique index clusters_name_uq on app.clusters (lower(name));

create table app.communities (
  id            uuid primary key default gen_random_uuid(),
  city_id       uuid not null references app.cities (id) on delete restrict,
  name          text not null check (length(trim(name)) between 1 and 120),
  code          text not null check (length(trim(code)) between 1 and 40),
  address_line  text,
  postal_code   text check (postal_code is null or postal_code ~ '^[1-9][0-9]{5}$'),
  -- Reference point for the attendance distance check (set via Google Maps).
  location_lat  numeric(9, 6) check (location_lat between -90 and 90),
  location_lng  numeric(9, 6) check (location_lng between -180 and 180),
  status        text not null default 'DRAFT'
                check (status in ('DRAFT', 'IMPORTED', 'CONFIGURED', 'ACTIVE', 'INACTIVE')),
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  constraint communities_location_pair check ((location_lat is null) = (location_lng is null))
);
create unique index communities_code_uq on app.communities (lower(code));
create unique index communities_city_name_uq on app.communities (city_id, lower(name));
create index communities_city_idx on app.communities (city_id);

create table app.cluster_community_memberships (
  id              uuid primary key default gen_random_uuid(),
  cluster_id      uuid not null references app.clusters (id) on delete restrict,
  community_id    uuid not null references app.communities (id) on delete restrict,
  effective_from  timestamptz not null default now(),
  effective_to    timestamptz,
  reason          text not null check (length(trim(reason)) >= 3),
  changed_by      uuid,
  constraint memberships_period check (effective_to is null or effective_to > effective_from)
);
-- Confirmed rule: a community is in exactly one cluster at a time.
create unique index memberships_one_active_per_community
  on app.cluster_community_memberships (community_id) where effective_to is null;
create index memberships_cluster_active_idx
  on app.cluster_community_memberships (cluster_id) where effective_to is null;

-- Membership rows are history: they may be closed (effective_to set once) but
-- never deleted or rewritten.
create or replace function app.tg_membership_close_only() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Cluster membership history cannot be deleted' using errcode = 'insufficient_privilege';
  end if;
  if old.effective_to is not null
     or new.cluster_id <> old.cluster_id
     or new.community_id <> old.community_id
     or new.effective_from <> old.effective_from
     or new.reason <> old.reason
     or new.effective_to is null then
    raise exception 'Cluster membership rows can only be closed once' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

create trigger memberships_close_only
  before update or delete on app.cluster_community_memberships
  for each row execute function app.tg_membership_close_only();

create table app.towers (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references app.communities (id) on delete restrict,
  name          text not null check (length(trim(name)) between 1 and 60),
  floor_count   integer check (floor_count between 0 and 200),
  location_lat  numeric(9, 6) check (location_lat between -90 and 90),
  location_lng  numeric(9, 6) check (location_lng between -180 and 180),
  status        text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  constraint towers_location_pair check ((location_lat is null) = (location_lng is null))
);
create unique index towers_community_name_uq on app.towers (community_id, lower(name));

create table app.flats (
  id            uuid primary key default gen_random_uuid(),
  tower_id      uuid not null references app.towers (id) on delete restrict,
  -- Denormalised for scope filtering; kept consistent with the tower by trigger.
  community_id  uuid not null references app.communities (id) on delete restrict,
  floor         integer check (floor between -5 and 200),
  flat_number   text not null check (length(trim(flat_number)) between 1 and 20),
  bhk_type      text check (bhk_type is null or length(bhk_type) <= 40),
  area_sqft     numeric(10, 2) check (area_sqft is null or area_sqft > 0),
  status        text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);
create unique index flats_tower_number_uq on app.flats (tower_id, lower(flat_number));
create index flats_community_idx on app.flats (community_id);

create or replace function app.tg_flat_community() returns trigger
language plpgsql
as $$
begin
  select t.community_id into new.community_id from app.towers t where t.id = new.tower_id;
  if new.community_id is null then
    raise exception 'Tower % does not exist', new.tower_id using errcode = 'foreign_key_violation';
  end if;
  return new;
end
$$;

create trigger flats_set_community
  before insert or update of tower_id on app.flats
  for each row execute function app.tg_flat_community();

-- Expansion-interest votes (RES-02A / ADM-03A). Written by the Resident app
-- from Phase 3; read-only aggregates in the Admin Portal from Milestone 1.
create table app.expansion_votes (
  id                uuid primary key default gen_random_uuid(),
  resident_user_id  uuid not null,
  level             text not null check (level in ('CITY', 'COMMUNITY')),
  city_id           uuid references app.cities (id) on delete restrict,
  city_name         text not null check (length(trim(city_name)) between 1 and 120),
  community_name    text check (community_name is null or length(trim(community_name)) between 1 and 120),
  created_at        timestamptz not null default now(),
  constraint votes_level_shape check (
    (level = 'CITY' and community_name is null)
    or (level = 'COMMUNITY' and community_name is not null and city_id is not null)
  )
);
-- One vote per resident per location.
create unique index expansion_votes_one_per_location on app.expansion_votes (
  resident_user_id, level, lower(city_name), coalesce(lower(community_name), '')
);

-- Stamping triggers
create trigger cities_stamp before insert or update on app.cities
  for each row execute function app.tg_stamp();
create trigger clusters_stamp before insert or update on app.clusters
  for each row execute function app.tg_stamp();
create trigger communities_stamp before insert or update on app.communities
  for each row execute function app.tg_stamp();
create trigger towers_stamp before insert or update on app.towers
  for each row execute function app.tg_stamp();
create trigger flats_stamp before insert or update on app.flats
  for each row execute function app.tg_stamp();

-- Privileges: no DELETE on master data (deactivate instead; history must stay linked).
grant select, insert, update on app.cities, app.clusters, app.communities, app.towers, app.flats to app_api;
grant select, insert, update on app.cluster_community_memberships to app_api;
grant select, insert on app.expansion_votes to app_api;
grant select on app.cities, app.clusters, app.communities, app.towers, app.flats,
  app.cluster_community_memberships to app_worker;
