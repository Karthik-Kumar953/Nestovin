-- ============================================================================
-- Phase 2: per-community catalogue & pricing (ADM-07, ADR-009)
-- Everything below is configured per community. A catalogue version is a
-- DRAFT until published; a PUBLISHED version and all its children are frozen.
-- Tier B tables (backend authorisation + DB privileges).
-- ============================================================================

-- ---------------------------------------------------------------- services
create table app.services (
  id    uuid primary key default gen_random_uuid(),
  code  text not null unique check (code in ('MAID', 'COOK', 'CARETAKER')),
  name  text not null,
  sort  smallint not null
);
insert into app.services (code, name, sort) values
  ('MAID', 'Maid', 1), ('COOK', 'Cook', 2), ('CARETAKER', 'Caretaker', 3);

-- ------------------------------------------------- community-level settings
alter table app.communities
  add column default_operating_mode text check (default_operating_mode in ('DEMAND_LED', 'CONTINUOUS')),
  add column timezone text not null default 'Asia/Kolkata';

create table app.community_services (
  community_id    uuid not null references app.communities (id) on delete restrict,
  service_id      uuid not null references app.services (id) on delete restrict,
  enabled         boolean not null default false,
  -- null = use the community default (owner decision: mode per community + service)
  operating_mode  text check (operating_mode in ('DEMAND_LED', 'CONTINUOUS')),
  version         integer not null default 1,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  primary key (community_id, service_id)
);

create table app.residence_categories (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references app.communities (id) on delete restrict,
  code          text not null check (length(trim(code)) between 1 and 40),
  label         text not null check (length(trim(label)) between 1 and 80),
  sort          smallint not null default 0,
  status        text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  unique (community_id, id)
);
create unique index residence_categories_code_uq on app.residence_categories (community_id, lower(code));

create table app.time_windows (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references app.communities (id) on delete restrict,
  name          text not null check (length(trim(name)) between 1 and 60),
  start_time    time not null,
  end_time      time not null,
  status        text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  constraint time_windows_order check (end_time > start_time),
  unique (community_id, id)
);
create unique index time_windows_name_uq on app.time_windows (community_id, lower(name));

create table app.service_tasks (
  id                    uuid primary key default gen_random_uuid(),
  community_id          uuid not null references app.communities (id) on delete restrict,
  service_id            uuid not null references app.services (id) on delete restrict,
  name                  text not null check (length(trim(name)) between 1 and 120),
  description           text check (description is null or length(description) <= 500),
  default_duration_min  integer check (default_duration_min between 1 and 720),
  status                text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  version               integer not null default 1,
  created_at            timestamptz not null default now(),
  created_by            uuid,
  updated_at            timestamptz not null default now(),
  updated_by            uuid,
  unique (community_id, id)
);
create unique index service_tasks_name_uq on app.service_tasks (community_id, service_id, lower(name));

-- Flats get their pricing category (from the migration workbook; editable) and occupancy.
alter table app.flats
  add column residence_category_id uuid,
  add column occupancy text check (occupancy in ('OWNER', 'TENANT', 'VACANT')),
  -- A flat's category must belong to the flat's own community.
  add constraint flats_category_same_community
    foreign key (community_id, residence_category_id) references app.residence_categories (community_id, id);
create index flats_category_idx on app.flats (residence_category_id);

-- ----------------------------------------------------------- catalogue versions
create table app.catalogue_versions (
  id              uuid primary key default gen_random_uuid(),
  community_id    uuid not null references app.communities (id) on delete restrict,
  version_no      integer not null check (version_no >= 1),
  status          text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED', 'SUPERSEDED')),
  effective_from  date,
  notes           text check (notes is null or length(notes) <= 500),
  published_at    timestamptz,
  published_by    uuid,
  version         integer not null default 1,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  unique (community_id, version_no),
  unique (community_id, id),
  constraint catalogue_published_fields check (
    (status = 'DRAFT' and published_at is null) or (status <> 'DRAFT' and published_at is not null)
  )
);
-- One published version per community; one draft at a time.
create unique index catalogue_one_published on app.catalogue_versions (community_id) where status = 'PUBLISHED';
create unique index catalogue_one_draft on app.catalogue_versions (community_id) where status = 'DRAFT';

create table app.plans (
  id                    uuid primary key default gen_random_uuid(),
  catalogue_version_id  uuid not null references app.catalogue_versions (id) on delete cascade,
  code                  text not null check (length(trim(code)) between 1 and 40),
  name                  text not null check (length(trim(name)) between 1 and 80),
  description           text check (description is null or length(description) <= 1000),
  validity_days         integer not null check (validity_days between 1 and 366),
  sort                  smallint not null default 0
);
create unique index plans_code_uq on app.plans (catalogue_version_id, lower(code));

create table app.plan_components (
  id                 uuid primary key default gen_random_uuid(),
  plan_id            uuid not null references app.plans (id) on delete cascade,
  service_id         uuid not null references app.services (id) on delete restrict,
  is_optional_addon  boolean not null default false,
  visits_per_day     smallint not null default 1 check (visits_per_day between 1 and 6),
  -- bitmask Mon=1, Tue=2, Wed=4, Thu=8, Fri=16, Sat=32, Sun=64
  days_of_week       smallint not null default 127 check (days_of_week between 1 and 127),
  duration_minutes   integer not null check (duration_minutes between 15 and 1440),
  time_window_id     uuid references app.time_windows (id) on delete restrict,
  addon_hours        numeric(4, 1) check (addon_hours is null or addon_hours > 0),
  sort               smallint not null default 0
);
create unique index plan_components_service_uq on app.plan_components (plan_id, service_id, is_optional_addon);

create table app.plan_component_tasks (
  plan_component_id  uuid not null references app.plan_components (id) on delete cascade,
  service_task_id    uuid not null references app.service_tasks (id) on delete restrict,
  frequency          text not null check (frequency in ('PER_VISIT', 'DAILY', 'WEEKLY', 'MONTHLY')),
  times_per_period   smallint not null default 1 check (times_per_period between 1 and 31),
  primary key (plan_component_id, service_task_id)
);

create table app.plan_prices (
  id                     uuid primary key default gen_random_uuid(),
  catalogue_version_id   uuid not null references app.catalogue_versions (id) on delete cascade,
  plan_id                uuid not null references app.plans (id) on delete cascade,
  residence_category_id  uuid not null references app.residence_categories (id) on delete restrict,
  price_basis            text not null check (price_basis in ('PACKAGE', 'SERVICE')),
  service_id             uuid references app.services (id) on delete restrict,
  amount_paise           bigint not null check (amount_paise > 0),
  currency               char(3) not null default 'INR',
  constraint plan_prices_basis_service check (
    (price_basis = 'PACKAGE' and service_id is null) or (price_basis = 'SERVICE' and service_id is not null)
  )
);
-- A missing row means "not offered" (owner decision); at most one price per cell.
create unique index plan_prices_cell_uq on app.plan_prices (
  plan_id, residence_category_id, price_basis, coalesce(service_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

create table app.plan_component_prices (
  plan_component_id      uuid not null references app.plan_components (id) on delete cascade,
  residence_category_id  uuid not null references app.residence_categories (id) on delete restrict,
  amount_paise           bigint not null check (amount_paise >= 0), -- 0 = included in the package
  currency               char(3) not null default 'INR',
  primary key (plan_component_id, residence_category_id)
);

-- --------------------------------------------------------------- integrity
-- Children of a catalogue must reference rows of the SAME community, and only
-- DRAFT versions may change. Resolved per row through the owning version.
create or replace function app.catalogue_version_of(p_table text, p_row jsonb) returns uuid
language plpgsql stable
as $$
declare
  v uuid;
begin
  case p_table
    when 'plans' then v := (p_row ->> 'catalogue_version_id')::uuid;
    when 'plan_prices' then v := (p_row ->> 'catalogue_version_id')::uuid;
    when 'plan_components' then
      select p.catalogue_version_id into v from app.plans p where p.id = (p_row ->> 'plan_id')::uuid;
    when 'plan_component_tasks', 'plan_component_prices' then
      select p.catalogue_version_id into v
        from app.plan_components c join app.plans p on p.id = c.plan_id
       where c.id = (p_row ->> 'plan_component_id')::uuid;
  end case;
  return v;
end
$$;

create or replace function app.tg_catalogue_draft_only() returns trigger
language plpgsql
as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
  ver uuid := app.catalogue_version_of(tg_table_name, rec);
  ver_status text;
  ver_community uuid;
  other_community uuid;
begin
  select status, community_id into ver_status, ver_community from app.catalogue_versions where id = ver;
  -- Cascade deletes of a whole draft version arrive with the version already gone.
  if ver_status is null then
    return coalesce(new, old);
  end if;
  if ver_status <> 'DRAFT' then
    raise exception 'Published catalogue versions cannot be changed' using errcode = 'check_violation';
  end if;

  if tg_op <> 'DELETE' then
    -- Cross-community references are impossible.
    if tg_table_name = 'plan_components' and new.time_window_id is not null then
      select community_id into other_community from app.time_windows where id = new.time_window_id;
      if other_community is distinct from ver_community then
        raise exception 'Time window belongs to another community' using errcode = 'check_violation';
      end if;
    elsif tg_table_name = 'plan_component_tasks' then
      select community_id into other_community from app.service_tasks where id = new.service_task_id;
      if other_community is distinct from ver_community then
        raise exception 'Task belongs to another community' using errcode = 'check_violation';
      end if;
    elsif tg_table_name in ('plan_prices', 'plan_component_prices') then
      if tg_table_name = 'plan_prices'
         and not exists (select 1 from app.plans p where p.id = new.plan_id and p.catalogue_version_id = new.catalogue_version_id) then
        raise exception 'Plan belongs to another catalogue version' using errcode = 'check_violation';
      end if;
      select community_id into other_community from app.residence_categories where id = new.residence_category_id;
      if other_community is distinct from ver_community then
        raise exception 'Residence category belongs to another community' using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return coalesce(new, old);
end
$$;

create trigger plans_draft_only before insert or update or delete on app.plans
  for each row execute function app.tg_catalogue_draft_only();
create trigger plan_components_draft_only before insert or update or delete on app.plan_components
  for each row execute function app.tg_catalogue_draft_only();
create trigger plan_component_tasks_draft_only before insert or update or delete on app.plan_component_tasks
  for each row execute function app.tg_catalogue_draft_only();
create trigger plan_prices_draft_only before insert or update or delete on app.plan_prices
  for each row execute function app.tg_catalogue_draft_only();
create trigger plan_component_prices_draft_only before insert or update or delete on app.plan_component_prices
  for each row execute function app.tg_catalogue_draft_only();

-- A published version can only move to SUPERSEDED; its identity fields never change.
create or replace function app.tg_catalogue_version_guard() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'DRAFT' then
      raise exception 'Published catalogue versions cannot be deleted' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if old.status = 'PUBLISHED' and not (new.status = 'SUPERSEDED' and new.community_id = old.community_id
      and new.version_no = old.version_no and new.published_at = old.published_at) then
    raise exception 'Published catalogue versions cannot be changed' using errcode = 'check_violation';
  end if;
  if old.status = 'SUPERSEDED' then
    raise exception 'Superseded catalogue versions cannot be changed' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger catalogue_versions_guard before update or delete on app.catalogue_versions
  for each row execute function app.tg_catalogue_version_guard();

-- Stamping
create trigger community_services_stamp before insert or update on app.community_services
  for each row execute function app.tg_stamp();
create trigger residence_categories_stamp before insert or update on app.residence_categories
  for each row execute function app.tg_stamp();
create trigger time_windows_stamp before insert or update on app.time_windows
  for each row execute function app.tg_stamp();
create trigger service_tasks_stamp before insert or update on app.service_tasks
  for each row execute function app.tg_stamp();
create trigger catalogue_versions_stamp before insert or update on app.catalogue_versions
  for each row execute function app.tg_stamp();

-- Privileges (no hard deletes of configuration masters; draft children are replaceable)
grant select on app.services to app_api, app_worker;
grant select, insert, update on app.community_services, app.residence_categories, app.time_windows,
  app.service_tasks to app_api;
grant select, insert, update, delete on app.catalogue_versions to app_api;
grant select, insert, update, delete on app.plans, app.plan_components, app.plan_component_tasks,
  app.plan_prices, app.plan_component_prices to app_api;
grant select on app.community_services, app.residence_categories, app.time_windows, app.service_tasks,
  app.catalogue_versions, app.plans, app.plan_components, app.plan_component_tasks, app.plan_prices,
  app.plan_component_prices to app_worker;
grant execute on function app.catalogue_version_of(text, jsonb) to app_api, app_worker;
