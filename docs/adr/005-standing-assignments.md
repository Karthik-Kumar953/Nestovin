# ADR-005: Standing assignments; eligibility filters; deferred capacity rules

**Status:** Accepted (owner, 20 Nov 2026)

## Decision
- Operations confirms **one employee per subscription's recurring slot/component** (standing assignment). Occurrences (visits) are generated from it.
- Replacement is per occurrence (one day) or per standing assignment (permanent). Both run the same checks.
- **Confirmed hard eligibility checks** (PRD §9.3) on every confirm/replace:
  - active + ready
  - qualified for service/task
  - in the authorised cluster
  - not on approved leave
  - no overlapping assignment
  - within configured work limits
- **Not invented:** capacity totals, demand→headcount, slot sellable counts, reservation after slot publication, and recommendation ranking. The system stores the inputs; the rules are implemented only after Operations validates them. Until then Operations chooses from the eligible list.
- Routine assignments need no employee acceptance. Overtime is the only offer → accept → admin-confirm flow.
