-- ============================================================================
-- Review M-2 (BUG-QA-016): money evidence and approved payroll are immutable
-- for the runtime roles, enforced by the database (ADR-004, ADR-006).
--
-- * payment_transactions: the API may change only `status` (refund outcome).
--   Amount, provider payment id, order and currency are fixed at insert.
-- * provider_events: the raw payload, signature verdict and event id are
--   evidence. The API may only record processing progress.
-- * payroll_lines / payroll_line_items: lines are never deleted by the API;
--   lines and entries change only while their run is a DRAFT (trigger).
--   Removing a manual entry from a draft stays possible (ADM-14).
-- Privileged roles (migrations, test cleanup through cascades) are not
-- affected by the trigger: it guards app_api and app_worker only.
-- ============================================================================

revoke update on app.payment_transactions from app_api;
grant update (status) on app.payment_transactions to app_api;

revoke update on app.provider_events from app_api;
grant update (processed_at, processing_error, attempts) on app.provider_events to app_api;

revoke delete, update on app.payroll_lines from app_api;
grant update (earnings_paise, deductions_paise, net_paise) on app.payroll_lines to app_api;

revoke update on app.payroll_line_items from app_api;

create or replace function app.tg_payroll_draft_only() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_run    uuid;
  v_status text;
begin
  if current_user not in ('app_api', 'app_worker') then
    return coalesce(new, old);
  end if;
  if tg_table_name = 'payroll_lines' then
    v_run := old.run_id;
  else
    select l.run_id into v_run from app.payroll_lines l where l.id = old.line_id;
  end if;
  select r.status into v_status from app.payroll_runs r where r.id = v_run;
  if v_status is distinct from 'DRAFT' then
    raise exception 'Payroll entries can change only while the payroll is a draft'
      using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create trigger payroll_lines_draft_only
  before update or delete on app.payroll_lines
  for each row execute function app.tg_payroll_draft_only();

create trigger payroll_line_items_draft_only
  before update or delete on app.payroll_line_items
  for each row execute function app.tg_payroll_draft_only();
