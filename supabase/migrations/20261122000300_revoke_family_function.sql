-- ============================================================================
-- Phase 3 fix: removing a family member (ADR-012).
-- A plain UPDATE from the Primary Resident fails RLS: once a membership is
-- REVOKED it is (correctly) outside the household's visible rows, and Postgres
-- re-checks the new row against the SELECT policy. This narrow function does
-- the ownership check itself and changes only that one family membership.
-- ============================================================================

create or replace function app.revoke_family_member(p_membership_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if app.claim_actor_kind() is distinct from 'resident' or app.claim_user_id() is null then
    raise exception 'Cannot remove family members outside a resident session' using errcode = '42501';
  end if;

  update app.residence_memberships f
     set status = 'REVOKED', ended_at = now(), end_reason = 'Removed by Primary Resident'
   where f.id = p_membership_id
     and f.kind = 'FAMILY'
     and f.status in ('PENDING', 'VERIFIED')
     and exists (
       select 1 from app.residence_memberships p
        where p.id = f.primary_membership_id
          and p.resident_id = app.claim_user_id()
          and p.kind = 'PRIMARY'
          and p.status = 'VERIFIED');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function app.revoke_family_member(uuid) from public;
grant execute on function app.revoke_family_member(uuid) to app_api;
