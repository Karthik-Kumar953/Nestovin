-- Review H-7: reconciliation re-polled the same 50 open orders every minute (no ordering, no
-- "last checked" marker), so newer orders could go unchecked for days. Track when each open order
-- was last checked and back off exponentially; index the exact predicate the job uses.
alter table app.payment_orders
  add column if not exists last_checked_at timestamptz,
  add column if not exists check_count integer not null default 0;

create index if not exists payment_orders_reconcile_idx
  on app.payment_orders (last_checked_at nulls first, created_at)
  where status in ('CREATED', 'EXPIRED') and provider_order_id is not null;
