-- ============================================================================
-- Phase 2: community migration from Excel (ADM-04, ADR-011)
-- Structure only (no personal data), all-or-nothing commit, uploader may
-- approve, residence category taken from the workbook. Tier B.
-- ============================================================================

create table app.import_batches (
  id                   uuid primary key default gen_random_uuid(),
  community_id         uuid not null references app.communities (id) on delete restrict,
  file_name            text not null check (length(file_name) between 1 and 255),
  file_sha256          text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  file_size_bytes      integer not null check (file_size_bytes > 0),
  status               text not null default 'VALIDATED'
                       check (status in ('VALIDATED', 'INVALID', 'APPROVED', 'REJECTED', 'COMMITTED', 'CANCELLED')),
  total_rows           integer not null default 0,
  valid_rows           integer not null default 0,
  error_rows           integer not null default 0,
  warning_rows         integer not null default 0,
  towers_new           integer not null default 0,
  flats_new            integer not null default 0,
  flats_updated        integer not null default 0,
  file_errors          text[] not null default '{}',
  uploaded_by          uuid not null,
  uploaded_at          timestamptz not null default now(),
  decided_by           uuid,
  decided_at           timestamptz,
  decision_reason      text,
  committed_by         uuid,
  committed_at         timestamptz,
  supersedes_batch_id  uuid references app.import_batches (id),
  constraint import_batch_commit_fields check ((status = 'COMMITTED') = (committed_at is not null))
);
create index import_batches_community_idx on app.import_batches (community_id, uploaded_at desc);
-- Only one batch per community may be waiting for a decision or commit at a time.
create unique index import_batches_one_open on app.import_batches (community_id)
  where status in ('VALIDATED', 'APPROVED');

create table app.import_rows (
  batch_id     uuid not null references app.import_batches (id) on delete cascade,
  row_number   integer not null check (row_number >= 2), -- spreadsheet row (1 = header)
  raw          jsonb not null,
  normalized   jsonb,
  errors       text[] not null default '{}',
  warnings     text[] not null default '{}',
  action       text check (action in ('CREATE', 'UPDATE', 'UNCHANGED')),
  primary key (batch_id, row_number)
);
create index import_rows_errors_idx on app.import_rows (batch_id) where cardinality(errors) > 0;

-- Committed and decided batches are history: their rows never change.
create or replace function app.tg_import_rows_frozen() returns trigger
language plpgsql
as $$
declare
  s text;
begin
  select status into s from app.import_batches where id = coalesce(new.batch_id, old.batch_id);
  if s in ('COMMITTED', 'REJECTED', 'CANCELLED') then
    raise exception 'Rows of a % batch cannot be changed', lower(s) using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end
$$;
create trigger import_rows_frozen before update or delete on app.import_rows
  for each row execute function app.tg_import_rows_frozen();

grant select, insert, update on app.import_batches to app_api;
grant select, insert on app.import_rows to app_api;
grant select on app.import_batches, app.import_rows to app_worker;
