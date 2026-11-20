-- ============================================================================
-- Phase 8: finance and basic payroll (ADM-14; ADR-007, ADR-014).
-- One common monthly cycle. Fixed monthly salary only, prorated by calendar
-- days. Absence/no-show deductions, overtime and statutory items have no
-- approved rule: lines are FLAGGED and Finance may add authorised entries.
-- Approval never means paid: payments are recorded after the actual transfer
-- and each payment creates exactly one linked salary expense.
--
-- Tier A (RLS): compensation_profiles, payroll_lines, payroll_line_items,
--   salary_payments, expense_entries. Tier B: payroll_periods, payroll_runs.
-- ============================================================================

create extension if not exists btree_gist with schema extensions;

alter table app.employees add column exited_on date;

create table app.compensation_profiles (
  id                    uuid primary key default gen_random_uuid(),
  employee_id           uuid not null references app.employees (id) on delete restrict,
  cluster_id            uuid references app.clusters (id) on delete restrict,
  compensation_type     text not null default 'FIXED_MONTHLY' check (compensation_type in ('FIXED_MONTHLY')), -- ADR-014; extensible (ADR-007)
  monthly_amount_paise  bigint not null check (monthly_amount_paise > 0),
  currency              char(3) not null default 'INR',
  effective_from        date not null,
  effective_to          date,
  approved_by           uuid,
  created_at            timestamptz not null default now(),
  constraint compensation_dates check (effective_to is null or effective_to >= effective_from),
  constraint compensation_no_overlap exclude using gist (
    employee_id with =, daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  )
);

create table app.payroll_periods (
  id          uuid primary key default gen_random_uuid(),
  month       date not null unique check (extract(day from month) = 1),
  created_at  timestamptz not null default now()
);

create table app.payroll_runs (
  id             uuid primary key default gen_random_uuid(),
  period_id      uuid not null references app.payroll_periods (id) on delete restrict,
  version        integer not null check (version >= 1),
  status         text not null default 'DRAFT' check (status in ('DRAFT', 'IN_REVIEW', 'APPROVED', 'RETURNED')),
  prepared_by    uuid,
  submitted_at   timestamptz,
  reviewed_by    uuid,
  reviewed_at    timestamptz,
  return_reason  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (period_id, version)
);
create unique index payroll_runs_one_open on app.payroll_runs (period_id) where status in ('DRAFT', 'IN_REVIEW');
create unique index payroll_runs_one_approved on app.payroll_runs (period_id) where status = 'APPROVED';

create table app.payroll_lines (
  id                  uuid primary key default gen_random_uuid(),
  run_id              uuid not null references app.payroll_runs (id) on delete cascade,
  employee_id         uuid not null references app.employees (id) on delete restrict,
  cluster_id          uuid references app.clusters (id) on delete restrict,
  compensation_snapshot jsonb not null default '[]'::jsonb,   -- segments used: amount, from, to, days
  days_in_month       smallint not null,
  payable_days        smallint not null default 0,
  attendance_summary  jsonb not null default '{}'::jsonb,     -- completed visits, no-shows, leave days (inputs, no formula)
  earnings_paise      bigint not null default 0,
  deductions_paise    bigint not null default 0 check (deductions_paise >= 0),
  net_paise           bigint not null default 0,
  flags               text[] not null default '{}',
  unique (run_id, employee_id)
);

create table app.payroll_line_items (
  id           uuid primary key default gen_random_uuid(),
  line_id      uuid not null references app.payroll_lines (id) on delete cascade,
  cluster_id   uuid references app.clusters (id) on delete restrict,
  kind         text not null check (kind in ('EARNING', 'DEDUCTION')),
  component    text not null check (component in ('BASE_SALARY', 'ALLOWANCE', 'INCENTIVE', 'APPROVED_OVERTIME', 'ABSENCE_DEDUCTION', 'OTHER_DEDUCTION', 'OTHER_EARNING')),
  amount_paise bigint not null check (amount_paise > 0),
  source_type  text not null check (source_type in ('CALCULATED', 'AUTHORISED_ENTRY')),
  note         text,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  constraint line_item_note check (source_type = 'CALCULATED' or (note is not null and length(trim(note)) >= 3))
);
create index payroll_line_items_line_idx on app.payroll_line_items (line_id);

-- Append-only; a correction is a reversal row referencing the original.
create table app.salary_payments (
  id                   uuid primary key default gen_random_uuid(),
  line_id              uuid not null references app.payroll_lines (id) on delete restrict,
  employee_id          uuid not null references app.employees (id) on delete restrict,
  cluster_id           uuid references app.clusters (id) on delete restrict,
  amount_paise         bigint not null check (amount_paise <> 0),   -- negative = reversal
  paid_on              date not null,
  method               text not null check (method in ('BANK_TRANSFER', 'UPI', 'CHEQUE', 'CASH')),
  reference            text,
  reverses_payment_id  uuid unique references app.salary_payments (id) on delete restrict,
  note                 text,
  recorded_by          uuid,
  created_at           timestamptz not null default now(),
  constraint salary_payment_sign check ((reverses_payment_id is null) = (amount_paise > 0))
);
create index salary_payments_line_idx on app.salary_payments (line_id);
-- Duplicate bank/UPI reference -> refused (reconcile instead).
create unique index salary_payments_reference_uq on app.salary_payments (method, lower(reference)) where reference is not null and reverses_payment_id is null;
create trigger salary_payments_append_only before update or delete on app.salary_payments
  for each row execute function app.tg_block_mutation();

create table app.expense_entries (
  id                 uuid primary key default gen_random_uuid(),
  category           text not null default 'SALARY' check (category in ('SALARY')),
  cluster_id         uuid references app.clusters (id) on delete restrict,
  amount_paise       bigint not null check (amount_paise <> 0),
  entry_date         date not null,
  salary_payment_id  uuid not null unique references app.salary_payments (id) on delete restrict, -- never a duplicate expense
  description        text,
  created_by         uuid,
  created_at         timestamptz not null default now()
);
create trigger expense_entries_append_only before update or delete on app.expense_entries
  for each row execute function app.tg_block_mutation();

-- ------------------------------------------------------------------ RLS
alter table app.compensation_profiles enable row level security;
create policy compensation_profiles_access on app.compensation_profiles
  using (app.claim_is_admin_in(cluster_id) or app.claim_is_employee(employee_id))
  with check (app.claim_is_admin_in(cluster_id));

alter table app.payroll_lines enable row level security;
create policy payroll_lines_access on app.payroll_lines
  using (app.claim_is_admin_in(cluster_id) or app.claim_is_employee(employee_id))
  with check (app.claim_is_admin_in(cluster_id));

alter table app.payroll_line_items enable row level security;
create policy payroll_line_items_access on app.payroll_line_items
  using (exists (select 1 from app.payroll_lines l where l.id = payroll_line_items.line_id))
  with check (app.claim_is_admin_in(cluster_id));

alter table app.salary_payments enable row level security;
create policy salary_payments_access on app.salary_payments
  using (app.claim_is_admin_in(cluster_id) or app.claim_is_employee(employee_id))
  with check (app.claim_is_admin_in(cluster_id));

alter table app.expense_entries enable row level security;
create policy expense_entries_access on app.expense_entries
  using (app.claim_is_admin_in(cluster_id))
  with check (app.claim_is_admin_in(cluster_id));

-- ------------------------------------------------------------ privileges
grant select, insert, update on app.compensation_profiles to app_api;
grant select, insert on app.payroll_periods to app_api;
grant select, insert, update on app.payroll_runs to app_api;
grant select, insert, update, delete on app.payroll_lines, app.payroll_line_items to app_api;
grant select, insert on app.salary_payments, app.expense_entries to app_api;
