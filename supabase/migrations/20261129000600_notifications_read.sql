-- Recipients may mark their own notifications as read (update read_at).
drop policy notifications_access on app.notifications;
create policy notifications_access on app.notifications
  using ((recipient_kind = 'resident' and app.claim_is_resident(recipient_id)) or (recipient_kind = 'employee' and app.claim_is_employee(recipient_id)) or app.claim_is_system())
  with check ((recipient_kind = 'resident' and app.claim_is_resident(recipient_id)) or (recipient_kind = 'employee' and app.claim_is_employee(recipient_id)) or app.claim_is_system());
revoke update on app.notifications from app_api;
grant update (read_at) on app.notifications to app_api;
