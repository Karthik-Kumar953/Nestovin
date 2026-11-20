# ADR-006: Razorpay vs Nestovin responsibilities; failure handling

**Status:** Accepted

## Decision
- **Razorpay** processes payments and reports provider events.
- **Nestovin** owns internal payment, booking and subscription state. It changes state only after its own server-side verification: signature check, then fetch the payment and compare order, amount, currency and purpose. A provider event is evidence, not a command.
- **Webhooks:** the raw event is stored with its provider event id as a unique key; processing is idempotent; each provider payment id applies to one purpose only.
- **Reconciliation job:** settles pending orders, covering provider success with a client timeout.
- **Unfulfillable payments** go to `REVIEW_REQUIRED` and appear in the ADM-08 exceptions queue. This covers: slot lost, cycle closed, deadline passed, duplicate payment, over-payment, and any mismatch.
- Refund events are recorded and linked when processed. **Refund, retain and forfeit policy and approval authority are OPEN; none is invented.**

The full failure/recovery table is in the approved plan §3.8 and will move to `docs/architecture/sequences.md` in Phase 4.
