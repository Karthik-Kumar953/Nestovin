-- The notification worker (actor_kind = 'system') must resolve resident recipients.
drop policy resident_profiles_access on app.resident_profiles;
create policy resident_profiles_access on app.resident_profiles
  using (
    app.claim_is_resident(id)
    or (app.claim_actor_kind() = 'resident' and exists (
          select 1 from app.residence_memberships m
           where m.resident_id = resident_profiles.id
             and m.flat_id = any (app.claim_household_flat_ids())
             and m.status in ('PENDING', 'VERIFIED')))
    or (app.claim_actor_kind() = 'admin' and (
          app.claim_has_cluster(null)
          or exists (select 1 from app.residence_memberships m where m.resident_id = resident_profiles.id)))
    or app.claim_is_system()
  )
  with check (app.claim_is_resident(id) or app.claim_actor_kind() = 'admin');
