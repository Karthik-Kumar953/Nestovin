# ADR-009: Per-community catalogue and price matrix

**Status:** Accepted (owner, 20 Nov 2026)

## Decision
- Every community has its own services, time windows, plans/packages, tasks and prices. These are entered in the **Community Setup wizard**, which spans ADM-04 migration and ADM-07 configuration. There is no global catalogue or price list.
- **Plan components:** service, visit frequency, duration, time window, and optional add-on (Caretaker, with hours).
- **Component tasks** carry their own frequency (daily/weekly/monthly).
- **Price matrix:** residence category × plan × (Maid / Cook / Caretaker / complete package). **An empty cell means not offered**; there is no NA magic value. Add-on contribution 0 = included.
- Matrices can be copied from another community as a draft.
- Publishing creates an immutable version. Existing commitments keep their snapshot.
- `docs/Architecture/Subscriptions Example.*` is illustrative only and is never seeded as data.
