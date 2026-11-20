-- ============================================================================
-- Phase 7: support escalation (ADM-13, ADR-014). Support -> relevant Cluster
-- Admin after 2 working days -> Super Admin after 2 more; urgent tickets go to
-- the Cluster Admin at once. Working days skip Sundays and the holidays below.
-- Support keeps ownership; escalation adds visibility and accountability.
-- ============================================================================

create table app.business_holidays (
  holiday_date  date primary key,
  name          text not null check (length(trim(name)) between 2 and 80),
  created_by    uuid,
  created_at    timestamptz not null default now()
);

insert into app.app_settings (key, value) values
  ('escalation_working_days', '[2, 2]'::jsonb)   -- ADR-014: to Cluster Admin, then to Super Admin
on conflict (key) do nothing;

alter table app.support_tickets
  add column escalation_level text not null default 'NONE' check (escalation_level in ('NONE', 'CLUSTER_ADMIN', 'SUPER_ADMIN')),
  add column escalated_at timestamptz,
  add column next_escalation_at timestamptz;
create index support_tickets_escalation_due_idx on app.support_tickets (next_escalation_at)
  where status not in ('RESOLVED', 'CLOSED') and next_escalation_at is not null;

create table app.ticket_escalations (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references app.support_tickets (id) on delete restrict,
  cluster_id  uuid references app.clusters (id) on delete restrict,
  level       text not null check (level in ('CLUSTER_ADMIN', 'SUPER_ADMIN')),
  trigger     text not null check (trigger in ('OVERDUE', 'URGENT', 'MANUAL')),
  reason      text,
  escalated_by uuid,
  notified    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index ticket_escalations_ticket_idx on app.ticket_escalations (ticket_id, created_at);
create trigger ticket_escalations_append_only before update or delete on app.ticket_escalations
  for each row execute function app.tg_block_mutation();

alter table app.ticket_escalations enable row level security;
create policy ticket_escalations_access on app.ticket_escalations
  using (app.claim_is_admin_in(cluster_id) or app.claim_is_system())
  with check (app.claim_is_admin_in(cluster_id) or app.claim_is_system());

grant select on app.business_holidays to app_api, app_worker;
grant insert, delete on app.business_holidays to app_api;
grant select, insert on app.ticket_escalations to app_api;
