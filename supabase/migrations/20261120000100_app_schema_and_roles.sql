-- ============================================================================
-- Nestovin: private application schema and runtime database roles (ADR-001)
--
-- * All business tables live in schema `app`, which is NOT exposed through the
--   Supabase Data API (config.toml api.schemas does not list it).
-- * Supabase client roles (anon, authenticated) get no access at all.
-- * Runtime roles:
--     app_api      - used by the API for request handling (subject to RLS)
--     app_worker   - used by background jobs (subject to RLS)
--   Both are created NOLOGIN here. Login + password are set per environment
--   outside migrations (see scripts/db/set-role-passwords.sql) so no secret is
--   ever committed.
-- ============================================================================

create schema if not exists app;

revoke all on schema app from public;
revoke all on schema app from anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_api') then
    create role app_api nologin noinherit nocreatedb nocreaterole nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_worker') then
    create role app_worker nologin noinherit nocreatedb nocreaterole nobypassrls;
  end if;
end
$$;

grant usage on schema app to app_api, app_worker;

-- Needed for gen_random_uuid() / citext in the app schema.
create extension if not exists citext with schema extensions;

-- Default: nothing is granted automatically. Each migration grants explicitly,
-- table by table, so every privilege is visible in code review.
alter default privileges in schema app revoke all on tables from public;
alter default privileges in schema app revoke all on tables from anon, authenticated;
alter default privileges in schema app revoke all on functions from public;
alter default privileges in schema app revoke all on functions from anon, authenticated;
