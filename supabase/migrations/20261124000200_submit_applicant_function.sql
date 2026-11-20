-- EMP-01 public intake: the public actor cannot read applicants (RLS), which also
-- rules out INSERT ... ON CONFLICT. This narrow function stores an application
-- and silently ignores a duplicate open application for the same phone.
create or replace function app.submit_applicant(p_full_name text, p_phone text, p_city text, p_services text[], p_note text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into app.applicants (full_name, phone, city, services, experience_note, source)
  values (p_full_name, p_phone, p_city, coalesce(p_services, '{}'), p_note, 'APP')
  on conflict (phone) where status in ('NEW', 'IN_REVIEW') do nothing
$$;
revoke all on function app.submit_applicant(text, text, text, text[], text) from public;
grant execute on function app.submit_applicant(text, text, text, text[], text) to app_api;
