-- ADM-04: structure can be entered in the dashboard table as well as uploaded as Excel.
-- Both go through the same validate -> approve -> commit pipeline.
alter table app.import_batches
  add column source text not null default 'EXCEL' check (source in ('EXCEL', 'DASHBOARD'));
