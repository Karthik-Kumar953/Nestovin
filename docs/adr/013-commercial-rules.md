# ADR-013: Renewal, unpaid balance, refunds, slot capacity

**Status:** Accepted (owner, 20 Nov 2026). Resolves C2, C4/OD-04 (forfeiture), C3 (slot capacity unit) and OPN-10 in part.

## Decisions
1. **Renewal: the resident renews and pays 100% of the current price.**
   - Before a subscription period ends, the resident is reminded and pays the full price of the community's **currently published** plan, for the same flat, plan and slot.
   - The standing assignment (same worker) continues where possible.
   - No auto-debit.
   - A renewal is a new booking-terms snapshot linked by `subscriptions.renews_subscription_id`.
2. **Unpaid demand-led balance: the initial amount is kept.**
   - If the remaining balance isn't verified by the published deadline, the commitment becomes `EXPIRED` and the initial payment is **retained, not refunded**.
   - **Disclosure is mandatory:** the resident must see the non-refundable rule (amount and deadline policy) and explicitly accept it before paying the initial amount. The acceptance (text version + timestamp) is stored on the demand request / terms snapshot.
   - Admins may still extend a deadline before it passes (audited, reason required).
3. **Refunds: Finance permission + reason.**
   - Any admin with `demand_payments:approve` may approve a refund, recording a reason. Example cases: payment succeeded but the slot is no longer available, duplicate payment.
   - The refund is issued in the Razorpay dashboard. The `refund.processed` webhook records it automatically and links it to the original transaction.
   - Fully audited.
4. **Slot capacity: the admin sets a number per slot.**
   - When publishing a slot (demand-led slot set or continuous slot), Operations enters its **capacity in households**.
   - The system stops selling that slot at capacity, enforced in the same transaction as the booking/allocation.
   - There is no automatic formula.

## Still OPEN
- Reminder schedule (how many days before the end of a period or the balance deadline).
- Cancellation / rescheduling policy (OPN-14).
- GST / receipts (I4).
