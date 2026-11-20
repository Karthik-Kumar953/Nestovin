-- Slot capacity must count every household holding a slot, but residents only see
-- their own bookings under RLS. This narrow function returns just the number.
create or replace function app.slot_usage(p_slot_id uuid, p_exclude_subscription uuid default null)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case s.mode
    when 'DEMAND_LED' then (
      select count(*)::int from app.demand_requests r
       where r.allocated_slot_id = s.id and r.status in ('COMMITTED', 'BALANCE_DUE', 'CONVERTED', 'REVIEW_REQUIRED'))
    else (
      select count(*)::int from app.bookings b join app.subscriptions sub on sub.booking_id = b.id
       where b.slot_id = s.id and b.status = 'CONFIRMED' and sub.status in ('PENDING_ACTIVATION', 'ACTIVE')
         and (p_exclude_subscription is null or sub.id <> p_exclude_subscription))
  end
  from app.slots s where s.id = p_slot_id
$$;
revoke all on function app.slot_usage(uuid, uuid) from public;
grant execute on function app.slot_usage(uuid, uuid) to app_api, app_worker;
