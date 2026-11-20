-- Single-runner lease for the in-process maintenance job. Session advisory locks
-- are unreliable through the transaction pooler, so an atomic UPDATE claims it.
insert into app.app_settings (key, value) values ('jobs_lease_until', to_jsonb('1970-01-01T00:00:00Z'::text))
  on conflict (key) do nothing;
