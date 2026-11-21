-- Review H-2: two renewals of the same subscription could be created at the same
-- time (double tap, or two family members). Both could be paid, and the second
-- payment's business effect then failed on subscriptions_one_renewal. Allow only
-- one live renewal booking per subscription, enforced by the database.
create unique index if not exists bookings_one_live_renewal
  on app.bookings (renews_subscription_id)
  where renews_subscription_id is not null
    and status in ('PENDING_PAYMENT', 'CONFIRMED', 'REVIEW_REQUIRED');
