# ADR-015: Booking eligibility, duplicates, tax and booking window

**Status:** Accepted (owner, 20 Nov 2026). Resolves I5, OPN-05, part of I4, and part of the RES-07D continuous-mode open decisions.

## Decisions
1. **A verified residence is required.** Only a Primary or Family member of a VERIFIED flat can submit a demand request or book. This is because the price depends on the flat's residence category.
2. **One active demand request per flat per cycle.**
   - A request can be cancelled while it is still awaiting payment, and a new one can then be submitted.
   - This is enforced by a partial unique index.
3. **Published prices are tax-inclusive.**
   - The amount shown is the amount paid, labelled "inclusive of taxes".
   - `tax_paise` stays null in snapshots until the GST rule is approved.
4. **Continuous mode: start date from tomorrow up to 14 days ahead.**
   - There is no same-day booking.
   - The window is a setting admins can change (`booking_window_days`, default 14).

## Engineering consequences (no new business rule)
- **What a purchase is:** a plan plus a **selection**. The selection is the complete package (PACKAGE price) or one service (that service's SERVICE price), plus optional add-on components that are priced for the flat's category.
  - A missing price means the selection is not offered.
  - The total and the included components are frozen in `booking_terms_snapshots`.
- **Mode check:** a selection can be bought in a mode only when every service in it uses that operating mode. Demand cycles offer demand-led selections; continuous slots offer continuous selections.
- **Initial percentage:** whole numbers from 1 to 99, locked when the cycle is published.
  - `initial = round_half_up(total × pct / 100)`
  - `remaining = total − initial`
- **Slot capacity (ADR-013):**
  - Continuous: checked when the order is created, and again with a row lock when the payment is verified.
  - Payment verified but the slot is full: the booking goes to `REVIEW_REQUIRED`, with a payment exception for an approved refund.
  - Demand-led: capacity is enforced when the admin allocates requests to slots.
- **Payment started before the deadline but settled after it:** the payment is recorded, the request goes to `REVIEW_REQUIRED`, and an exception is raised. The service is never activated silently.
- **Subscriptions** are created as `PENDING_ACTIVATION`. They become `ACTIVE` once a worker is assigned and the start date is reached (Phase 5).
