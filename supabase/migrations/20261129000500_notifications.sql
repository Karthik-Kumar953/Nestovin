-- RES-13 / EMP-10: device tokens, in-app inbox and delivery bookkeeping.
-- The outbox is filled in the same transaction as the business change; a
-- worker turns PUSH rows into inbox entries (+ FCM push when configured) and
-- sends EMAIL rows (Resend when configured). A notification failure never rolls
-- back business state. Push text never contains personal data.

alter table app.notification_outbox drop constraint notification_outbox_status_check;
alter table app.notification_outbox add constraint notification_outbox_status_check
  check (status in ('PENDING', 'SENT', 'FAILED', 'DEAD', 'SKIPPED'));

create table app.device_tokens (
  id            uuid primary key default gen_random_uuid(),
  owner_kind    text not null check (owner_kind in ('resident', 'employee')),
  owner_id      uuid not null,
  token         text not null unique check (length(token) between 20 and 4096),
  platform      text not null check (platform in ('android', 'ios')),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
create index device_tokens_owner_idx on app.device_tokens (owner_kind, owner_id);

create table app.notifications (
  id              uuid primary key default gen_random_uuid(),
  recipient_kind  text not null check (recipient_kind in ('resident', 'employee')),
  recipient_id    uuid not null,
  outbox_id       uuid unique references app.notification_outbox (id) on delete set null,
  event_type      text not null,
  title           text not null,
  body            text not null,
  data            jsonb not null default '{}'::jsonb,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index notifications_recipient_idx on app.notifications (recipient_kind, recipient_id, created_at desc);

-- Own rows only (resident or employee session); the worker runs as system.
alter table app.device_tokens enable row level security;
create policy device_tokens_access on app.device_tokens
  using ((owner_kind = 'resident' and app.claim_is_resident(owner_id)) or (owner_kind = 'employee' and app.claim_is_employee(owner_id)) or app.claim_is_system())
  with check ((owner_kind = 'resident' and app.claim_is_resident(owner_id)) or (owner_kind = 'employee' and app.claim_is_employee(owner_id)) or app.claim_is_system());

alter table app.notifications enable row level security;
create policy notifications_access on app.notifications
  using ((recipient_kind = 'resident' and app.claim_is_resident(recipient_id)) or (recipient_kind = 'employee' and app.claim_is_employee(recipient_id)) or app.claim_is_system())
  with check (app.claim_is_system());

grant select, insert, update, delete on app.device_tokens to app_api;
grant select, insert, update on app.notifications to app_api;
grant select, update on app.notification_outbox to app_api;
