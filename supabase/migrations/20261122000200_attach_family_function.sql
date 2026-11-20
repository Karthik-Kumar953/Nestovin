-- ============================================================================
-- Attach approved family members to their household (ADR-012).
--
-- A family member signs in with their own phone. Their approved request was
-- created by the Primary Resident, so RLS correctly hides it from them. This
-- SECURITY DEFINER function does exactly one thing: for the resident whose
-- phone is given (taken by the API from the VERIFIED JWT, never from input),
-- create the FAMILY membership for each approved, not-yet-attached request whose
-- Primary membership is still VERIFIED, if the resident has no active membership.
-- Returns the number of memberships created.
-- ============================================================================

create or replace function app.attach_approved_family(p_phone text) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_resident uuid;
  v_membership uuid;
  created integer := 0;
begin
  select id into v_resident from app.resident_profiles where phone = p_phone and status = 'ACTIVE';
  if v_resident is null then
    return 0;
  end if;

  for r in
    select far.id, pm.flat_id, pm.id as primary_id
      from app.family_access_requests far
      join app.residence_memberships pm on pm.id = far.primary_membership_id
     where far.phone = p_phone
       and far.status = 'APPROVED'
       and far.resulting_membership_id is null
       and pm.status = 'VERIFIED'
       and pm.kind = 'PRIMARY'
     order by far.reviewed_at
     for update of far
  loop
    -- V1: one active residence context per resident.
    exit when exists (
      select 1 from app.residence_memberships m
       where m.resident_id = v_resident and m.status in ('PENDING', 'VERIFIED')
    );
    insert into app.residence_memberships
      (resident_id, flat_id, community_id, kind, occupancy, status, primary_membership_id, verified_at)
    values
      (v_resident, r.flat_id, (select community_id from app.flats where id = r.flat_id),
       'FAMILY', 'FAMILY', 'VERIFIED', r.primary_id, now())
    returning id into v_membership;
    update app.family_access_requests set resulting_membership_id = v_membership where id = r.id;
    created := created + 1;
  end loop;
  return created;
end
$$;

revoke all on function app.attach_approved_family(text) from public;
grant execute on function app.attach_approved_family(text) to app_api;
