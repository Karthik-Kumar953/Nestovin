-- Review H-1 (part 1): operational rows must carry the cluster that applies WHEN THEY ARE CREATED
-- (ADR-001). Services copied the cluster from the resident's membership, which was frozen when the
-- resident registered, so after a community moved to another cluster every new booking, ticket,
-- payment and visit was stamped with the old cluster: the new cluster's admins could not see them,
-- the old cluster's admins still could, and the new cluster's workers failed the eligibility check.
--
-- The database now stamps cluster_id from the community's CURRENT cluster on insert, for every
-- Tier A table that has a community_id. Existing rows are untouched (history keeps the cluster it
-- had); whether open work follows a moved community is an owner decision, handled separately.

create or replace function app.tg_scope_from_community() returns trigger
language plpgsql
as $$
declare
  v_cluster uuid;
begin
  if new.community_id is null then
    return new; -- e.g. a support ticket not tied to a community keeps what the service set
  end if;
  select m.cluster_id into v_cluster
    from app.cluster_community_memberships m
   where m.community_id = new.community_id and m.effective_to is null;
  if v_cluster is not null then
    new.cluster_id := v_cluster;
  end if;
  return new;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'documents', 'residence_verification_requests', 'family_access_requests', 'resident_change_requests',
    'support_tickets', 'booking_terms_snapshots', 'demand_requests', 'bookings', 'subscriptions',
    'payment_orders', 'service_occurrences'
  ] loop
    execute format('drop trigger if exists %I on app.%I', t || '_scope_from_community', t);
    execute format(
      'create trigger %I before insert on app.%I for each row execute function app.tg_scope_from_community()',
      t || '_scope_from_community', t
    );
  end loop;
end
$$;
