-- ============================================================================
-- Core helpers: request claims, stamping trigger, append-only audit log
-- ============================================================================

-- Request claims are set by the API at the start of every transaction with
-- SET LOCAL (see apps/api/src/db/transaction.ts). These helpers read them.
-- `true` = missing_ok, so an unset claim returns NULL instead of erroring.

create or replace function app.claim_user_id() returns uuid
language sql stable
as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create or replace function app.claim_actor_kind() returns text
language sql stable
as $$ select nullif(current_setting('app.actor_kind', true), '') $$;

create or replace function app.claim_is_super_admin() returns boolean
language sql stable
as $$ select coalesce(nullif(current_setting('app.is_super_admin', true), '')::boolean, false) $$;

-- Comma-separated cluster ids the caller may access. '*' = all clusters.
create or replace function app.claim_has_cluster(target uuid) returns boolean
language sql stable
as $$
  select case
    when coalesce(current_setting('app.cluster_ids', true), '') = '*' then true
    when target is null then false
    else target::text = any (string_to_array(coalesce(current_setting('app.cluster_ids', true), ''), ','))
  end
$$;

grant execute on function app.claim_user_id(), app.claim_actor_kind(), app.claim_is_super_admin(),
  app.claim_has_cluster(uuid) to app_api, app_worker;

-- Stamping trigger for editable tables:
--   insert: created_by/updated_by from the claim, version = 1
--   update: updated_at = now(), updated_by from the claim, version + 1
-- Optimistic concurrency is enforced by the API (`WHERE version = $expected`);
-- the trigger only guarantees the version always moves forward.
create or replace function app.tg_stamp() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := new.created_at;
    new.created_by := coalesce(new.created_by, app.claim_user_id());
    new.updated_by := new.created_by;
    new.version := 1;
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := coalesce(app.claim_user_id(), new.updated_by);
    new.version := old.version + 1;
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- Audit log (append-only). Written in the same transaction as the change.
-- ---------------------------------------------------------------------------
create table app.audit_events (
  id            bigint generated always as identity primary key,
  occurred_at   timestamptz not null default now(),
  actor_id      uuid,
  actor_kind    text not null check (actor_kind in ('admin', 'resident', 'employee', 'system', 'public')),
  action        text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  target_type   text not null,
  target_id     text,
  request_id    text,
  reason        text,
  before_data   jsonb,
  after_data    jsonb
);

create index audit_events_target_idx on app.audit_events (target_type, target_id, occurred_at desc);
create index audit_events_actor_idx on app.audit_events (actor_id, occurred_at desc);

create or replace function app.tg_block_mutation() returns trigger
language plpgsql
as $$
begin
  raise exception 'Table %.% is append-only', tg_table_schema, tg_table_name
    using errcode = 'insufficient_privilege';
end
$$;

create trigger audit_events_append_only
  before update or delete on app.audit_events
  for each row execute function app.tg_block_mutation();

create trigger audit_events_no_truncate
  before truncate on app.audit_events
  for each statement execute function app.tg_block_mutation();

-- Runtime roles may only insert and read audit rows.
grant select, insert on app.audit_events to app_api, app_worker;
