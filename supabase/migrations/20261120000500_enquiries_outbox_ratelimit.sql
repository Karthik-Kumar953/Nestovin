-- ============================================================================
-- Website enquiries (WEB-05/10), transactional notification outbox, and
-- Postgres-backed rate limiting. Tier B tables.
-- ============================================================================

create sequence app.enquiry_reference_seq;

create table app.website_enquiries (
  id              uuid primary key default gen_random_uuid(),
  reference       text not null unique
                  default ('ENQ-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('app.enquiry_reference_seq')::text, 5, '0')),
  name            text not null,
  phone           text not null,
  email           extensions.citext,
  city            text,
  community       text,
  message         text not null,
  consent_at      timestamptz not null,
  source_ip_hash  text,
  user_agent      text,
  status          text not null default 'NEW' check (status in ('NEW', 'IN_PROGRESS', 'CLOSED')),
  routing_status  text not null default 'PENDING' check (routing_status in ('PENDING', 'ROUTED', 'FAILED')),
  routed_at       timestamptz,
  created_at      timestamptz not null default now()
);
create index website_enquiries_created_idx on app.website_enquiries (created_at desc);

-- Side effects (email/SMS/push) are written here in the same transaction as
-- the business change and delivered by the worker (ADR-003).
create table app.notification_outbox (
  id               uuid primary key default gen_random_uuid(),
  event_type       text not null,
  dedupe_key       text not null unique,
  channel          text not null check (channel in ('EMAIL', 'SMS', 'PUSH')),
  recipient        text not null,
  payload          jsonb not null default '{}'::jsonb,
  status           text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'FAILED', 'DEAD')),
  attempts         integer not null default 0,
  next_attempt_at  timestamptz not null default now(),
  last_error       text,
  created_at       timestamptz not null default now(),
  sent_at          timestamptz
);
create index notification_outbox_due_idx on app.notification_outbox (next_attempt_at) where status = 'PENDING';

-- Fixed-window rate limiting shared by all API instances.
create table app.rate_limit_buckets (
  bucket_key    text not null,
  window_start  timestamptz not null,
  hits          integer not null default 0,
  primary key (bucket_key, window_start)
);

-- Atomically count a hit and return the new total for the current window.
create or replace function app.rate_limit_hit(p_key text, p_window_seconds integer) returns integer
language plpgsql
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  total integer;
begin
  insert into app.rate_limit_buckets as b (bucket_key, window_start, hits)
  values (p_key, w, 1)
  on conflict (bucket_key, window_start) do update set hits = b.hits + 1
  returning hits into total;
  return total;
end
$$;

grant select, insert on app.website_enquiries to app_api;
grant update (status) on app.website_enquiries to app_api;
grant usage on sequence app.enquiry_reference_seq to app_api;
grant select, insert on app.notification_outbox to app_api;
grant select, update on app.notification_outbox to app_worker;
grant update (routing_status, routed_at) on app.website_enquiries to app_worker;
grant select on app.website_enquiries to app_worker;
grant select, insert, update, delete on app.rate_limit_buckets to app_api;
grant execute on function app.rate_limit_hit(text, integer) to app_api;
