-- ============================================================================
-- IAM-style admin access (ADR-008, ADM-02)
--   * Super Admin = root (flag on admin_profiles)
--   * roles = reusable bundles of (module, action) grants
--   * admins get roles + optional per-user extra grants (allow-only union)
--   * data scope is per admin: GLOBAL or a list of clusters
-- The module/action catalogue MUST match packages/contracts/src/permissions.ts
-- (enforced by apps/api/test/db/catalogue.test.ts).
-- ============================================================================

create table app.permission_modules (
  key        text primary key,
  ref        text not null unique,
  label      text not null,
  grantable  boolean not null
);

create table app.permission_actions (
  key text primary key
);

create table app.permission_module_actions (
  module_key text not null references app.permission_modules (key),
  action_key text not null references app.permission_actions (key),
  primary key (module_key, action_key)
);

insert into app.permission_actions (key) values
  ('view'), ('create'), ('edit'), ('delete'), ('approve'), ('export'), ('publish'), ('record_payment');

insert into app.permission_modules (key, ref, label, grantable) values
  ('overview',            'ADM-01', 'Admin home & overview', true),
  ('admin_access',        'ADM-02', 'Admin users, roles & permissions', false),
  ('locations',           'ADM-03', 'City, community, cluster, tower & flat master data', true),
  ('community_migration', 'ADM-04', 'Community migration (Excel)', true),
  ('residents',           'ADM-05', 'Resident management', true),
  ('family_requests',     'ADM-06', 'Family-member approval requests', true),
  ('catalogue_pricing',   'ADM-07', 'Service, task, plan & pricing configuration', true),
  ('demand_payments',     'ADM-08', 'Demand, booking & payment status', true),
  ('employees',           'ADM-09', 'Employee profile & verification', true),
  ('scheduling',          'ADM-10', 'Scheduling & time-slot configuration', true),
  ('allocation',          'ADM-11', 'Work allocation & replacement', true),
  ('attendance',          'ADM-12', 'Attendance & service records', true),
  ('support',             'ADM-13', 'Support tickets & website enquiries', true),
  ('finance_payroll',     'ADM-14', 'Finance & basic payroll', true);

insert into app.permission_module_actions (module_key, action_key) values
  ('overview', 'view'),
  ('admin_access', 'view'), ('admin_access', 'create'), ('admin_access', 'edit'), ('admin_access', 'delete'),
  ('locations', 'view'), ('locations', 'create'), ('locations', 'edit'), ('locations', 'delete'), ('locations', 'export'),
  ('community_migration', 'view'), ('community_migration', 'create'), ('community_migration', 'approve'), ('community_migration', 'publish'),
  ('residents', 'view'), ('residents', 'edit'), ('residents', 'approve'), ('residents', 'export'),
  ('family_requests', 'view'), ('family_requests', 'approve'),
  ('catalogue_pricing', 'view'), ('catalogue_pricing', 'create'), ('catalogue_pricing', 'edit'), ('catalogue_pricing', 'delete'), ('catalogue_pricing', 'publish'),
  ('demand_payments', 'view'), ('demand_payments', 'create'), ('demand_payments', 'edit'), ('demand_payments', 'approve'), ('demand_payments', 'publish'), ('demand_payments', 'export'),
  ('employees', 'view'), ('employees', 'create'), ('employees', 'edit'), ('employees', 'approve'), ('employees', 'export'),
  ('scheduling', 'view'), ('scheduling', 'create'), ('scheduling', 'edit'), ('scheduling', 'delete'), ('scheduling', 'publish'),
  ('allocation', 'view'), ('allocation', 'create'), ('allocation', 'edit'), ('allocation', 'approve'),
  ('attendance', 'view'), ('attendance', 'approve'), ('attendance', 'export'),
  ('support', 'view'), ('support', 'create'), ('support', 'edit'), ('support', 'approve'), ('support', 'export'),
  ('finance_payroll', 'view'), ('finance_payroll', 'create'), ('finance_payroll', 'edit'), ('finance_payroll', 'approve'), ('finance_payroll', 'record_payment'), ('finance_payroll', 'export');

-- ---------------------------------------------------------------------------
-- Admin profiles: one per Supabase auth user that is an admin. An auth user
-- without a row here has no admin access at all (invite-only).
-- ---------------------------------------------------------------------------
create table app.admin_profiles (
  id              uuid primary key references auth.users (id) on delete restrict,
  email           extensions.citext not null unique,
  full_name       text not null check (length(trim(full_name)) between 2 and 120),
  title           text check (title is null or length(title) <= 80),
  is_super_admin  boolean not null default false,
  status          text not null default 'INVITED' check (status in ('INVITED', 'ACTIVE', 'DISABLED')),
  scope_type      text not null default 'CLUSTERS' check (scope_type in ('GLOBAL', 'CLUSTERS')),
  last_sign_in_at timestamptz,
  version         integer not null default 1,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  updated_by      uuid
);

create trigger admin_profiles_stamp before insert or update on app.admin_profiles
  for each row execute function app.tg_stamp();

-- Guard: there must always be at least one active Super Admin once one exists.
create or replace function app.tg_keep_one_super_admin() returns trigger
language plpgsql
as $$
declare
  remaining integer;
begin
  if (tg_op = 'DELETE' and old.is_super_admin and old.status = 'ACTIVE')
     or (tg_op = 'UPDATE' and old.is_super_admin and old.status = 'ACTIVE'
         and (not new.is_super_admin or new.status <> 'ACTIVE')) then
    select count(*) into remaining
      from app.admin_profiles
     where is_super_admin and status = 'ACTIVE' and id <> old.id;
    if remaining = 0 then
      raise exception 'Cannot remove the last active Super Admin' using errcode = 'check_violation';
    end if;
  end if;
  return coalesce(new, old);
end
$$;

create trigger admin_profiles_keep_super_admin
  before update or delete on app.admin_profiles
  for each row execute function app.tg_keep_one_super_admin();

-- ---------------------------------------------------------------------------
-- Roles and grants
-- ---------------------------------------------------------------------------
create table app.roles (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) between 2 and 60),
  description  text check (description is null or length(description) <= 300),
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  created_by   uuid,
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);
create unique index roles_name_uq on app.roles (lower(name));
create trigger roles_stamp before insert or update on app.roles
  for each row execute function app.tg_stamp();

create table app.role_grants (
  role_id     uuid not null references app.roles (id) on delete cascade,
  module_key  text not null,
  action_key  text not null,
  primary key (role_id, module_key, action_key),
  foreign key (module_key, action_key) references app.permission_module_actions (module_key, action_key)
);

create table app.admin_role_assignments (
  admin_id     uuid not null references app.admin_profiles (id) on delete cascade,
  role_id      uuid not null references app.roles (id) on delete restrict,
  assigned_at  timestamptz not null default now(),
  assigned_by  uuid,
  primary key (admin_id, role_id)
);
create index admin_role_assignments_role_idx on app.admin_role_assignments (role_id);

create table app.admin_extra_grants (
  admin_id    uuid not null references app.admin_profiles (id) on delete cascade,
  module_key  text not null,
  action_key  text not null,
  granted_at  timestamptz not null default now(),
  granted_by  uuid,
  primary key (admin_id, module_key, action_key),
  foreign key (module_key, action_key) references app.permission_module_actions (module_key, action_key)
);

-- Super-Admin-only modules can never be granted (defence in depth; the API
-- validates this too).
create or replace function app.tg_grant_must_be_grantable() returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from app.permission_modules m where m.key = new.module_key and m.grantable) then
    raise exception 'Module % is reserved for the Super Admin', new.module_key using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger role_grants_grantable before insert or update on app.role_grants
  for each row execute function app.tg_grant_must_be_grantable();
create trigger admin_extra_grants_grantable before insert or update on app.admin_extra_grants
  for each row execute function app.tg_grant_must_be_grantable();

-- Per-admin cluster scope (used when admin_profiles.scope_type = 'CLUSTERS').
create table app.admin_cluster_scopes (
  admin_id    uuid not null references app.admin_profiles (id) on delete cascade,
  cluster_id  uuid not null references app.clusters (id) on delete restrict,
  granted_at  timestamptz not null default now(),
  granted_by  uuid,
  primary key (admin_id, cluster_id)
);

-- Effective permissions = role grants UNION extra grants (allow-only).
create view app.admin_effective_grants as
  select ara.admin_id, rg.module_key, rg.action_key, r.name as source
    from app.admin_role_assignments ara
    join app.roles r on r.id = ara.role_id
    join app.role_grants rg on rg.role_id = ara.role_id
  union all
  select aeg.admin_id, aeg.module_key, aeg.action_key, 'extra' as source
    from app.admin_extra_grants aeg;

-- Privileges
grant select on app.permission_modules, app.permission_actions, app.permission_module_actions to app_api;
grant select, insert, update on app.admin_profiles to app_api;
grant select, insert, update, delete on app.roles, app.role_grants, app.admin_role_assignments,
  app.admin_extra_grants, app.admin_cluster_scopes to app_api;
grant select on app.admin_effective_grants to app_api;
grant select on app.admin_profiles to app_worker;
