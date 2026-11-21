-- Review H-3: a webhook whose processing failed was acknowledged and never retried.
-- Retries may now re-claim an unprocessed event, and a job reprocesses stuck events.
alter table app.provider_events add column if not exists attempts integer not null default 0;

create index if not exists provider_events_unprocessed_idx
  on app.provider_events (received_at)
  where processed_at is null and signature_valid;

-- Events that keep failing surface in the ADM-08 exceptions queue.
alter table app.payment_exceptions drop constraint if exists payment_exceptions_reason_code_check;
alter table app.payment_exceptions add constraint payment_exceptions_reason_code_check check (reason_code in (
  'AMOUNT_MISMATCH', 'CURRENCY_MISMATCH', 'SLOT_UNAVAILABLE', 'CYCLE_CLOSED', 'DEADLINE_PASSED',
  'DUPLICATE_PAYMENT', 'RECORD_NOT_PAYABLE', 'UNAPPROVED_REFUND', 'UNKNOWN_ORDER', 'WEBHOOK_FAILED'));
