-- The escalation job runs with actor_kind = 'system'; allow it on tickets and updates.
drop policy tickets_access on app.support_tickets;
create policy tickets_access on app.support_tickets
  using (
    app.claim_is_resident(resident_id)
    or (app.claim_actor_kind() = 'resident' and flat_id = any (app.claim_household_flat_ids()))
    or app.claim_is_admin_in(cluster_id)
    or app.claim_is_system()
  )
  with check (app.claim_is_resident(resident_id) or app.claim_is_admin_in(cluster_id) or app.claim_is_system());

drop policy ticket_updates_access on app.ticket_updates;
create policy ticket_updates_access on app.ticket_updates
  using (
    exists (select 1 from app.support_tickets t where t.id = ticket_updates.ticket_id)
    and (app.claim_actor_kind() in ('admin', 'system') or visibility = 'RESIDENT')
  )
  with check (
    exists (select 1 from app.support_tickets t where t.id = ticket_updates.ticket_id)
    and (app.claim_actor_kind() in ('admin', 'system') or (visibility = 'RESIDENT' and author_kind = 'resident'))
  );
