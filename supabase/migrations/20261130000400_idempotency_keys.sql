-- Review H-4 / ADR-004: money and booking POSTs must be idempotent. A retried request with the
-- same key replays the first response instead of creating a second booking or payment order.
create table if not exists app.idempotency_keys (
  actor_kind   text not null check (actor_kind in ('admin', 'resident', 'employee')),
  actor_id     uuid not null,
  key          text not null check (key ~ '^[A-Za-z0-9_-]{8,100}$'),
  route        text not null,
  request_hash text not null,
  status_code  integer,
  response     jsonb,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '24 hours',
  primary key (actor_kind, actor_id, key)
);
create index if not exists idempotency_keys_expiry_idx on app.idempotency_keys (expires_at);

-- Tier B (backend only): no client role may touch it; the API needs delete to release a key after a 5xx
-- and for the expiry clean-up.
revoke all on app.idempotency_keys from public, anon, authenticated;
grant select, insert, update, delete on app.idempotency_keys to app_api;
