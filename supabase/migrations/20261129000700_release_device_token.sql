-- A device token belongs to whoever signed in last on that device. The new
-- owner cannot see the previous owner's row under RLS, so this narrow function
-- removes it before the new registration.
create or replace function app.release_device_token(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from app.device_tokens
   where token = p_token
     and app.claim_actor_kind() in ('resident', 'employee')
     and not (owner_kind = app.claim_actor_kind() and owner_id = app.claim_user_id())
$$;
revoke all on function app.release_device_token(text) from public;
grant execute on function app.release_device_token(text) to app_api;
