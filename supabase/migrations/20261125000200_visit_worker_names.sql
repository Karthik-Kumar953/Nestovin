-- RES-10: residents may see the first name of the worker on their own visits and
-- the check-in time, without read access to employee or attendance rows.
create or replace function app.visit_worker_names(p_ids uuid[])
returns table (occurrence_id uuid, name text, checked_in timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, split_part(e.full_name, ' ', 1),
         (select min(ev.server_time) from app.attendance_events ev where ev.occurrence_id = o.id and ev.result = 'VERIFIED')
    from app.service_occurrences o
    join app.occurrence_assignments a on a.occurrence_id = o.id and a.status = 'ACTIVE'
    join app.employees e on e.id = a.employee_id
   where o.id = any (p_ids)
     and app.claim_actor_kind() = 'resident'
     and o.flat_id = any (app.claim_household_flat_ids())
$$;
revoke all on function app.visit_worker_names(uuid[]) from public;
grant execute on function app.visit_worker_names(uuid[]) to app_api;
