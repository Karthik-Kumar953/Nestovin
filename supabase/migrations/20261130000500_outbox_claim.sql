-- Review H-5: two workers could select and deliver the same PENDING outbox rows (duplicate pushes and
-- emails). Rows are now claimed atomically (FOR UPDATE SKIP LOCKED + a short claim window).
alter table app.notification_outbox add column if not exists locked_until timestamptz;

create index if not exists notification_outbox_due_idx
  on app.notification_outbox (next_attempt_at)
  where status = 'PENDING';
