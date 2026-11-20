-- EMP-08: an invited worker must see the visit they are offered (date, time,
-- flat) before accepting. Visible only while the offer is open.
create or replace function app.claim_employee_offered_occurrence_ids() returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(o.occurrence_id), '{}')
    from app.overtime_offers o
    join app.overtime_offer_responses r on r.offer_id = o.id
   where app.claim_actor_kind() = 'employee' and r.employee_id = app.claim_user_id() and o.status = 'OPEN'
$$;
revoke all on function app.claim_employee_offered_occurrence_ids() from public;
grant execute on function app.claim_employee_offered_occurrence_ids() to app_api, app_worker;

drop policy service_occurrences_access on app.service_occurrences;
create policy service_occurrences_access on app.service_occurrences
  using (app.claim_is_admin_in(cluster_id) or app.claim_is_system()
         or (app.claim_actor_kind() = 'resident' and flat_id = any (app.claim_household_flat_ids()))
         or id = any (app.claim_employee_occurrence_ids())
         or id = any (app.claim_employee_offered_occurrence_ids()))
  with check (app.claim_is_admin_in(cluster_id) or app.claim_is_system() or id = any (app.claim_employee_occurrence_ids()));
