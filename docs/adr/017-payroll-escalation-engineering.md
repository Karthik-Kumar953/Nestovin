# ADR-017: Payroll and escalation engineering choices

**Status:** Accepted (engineering, 20 Nov 2026). Applies ADR-014 and ADM-13/14 without inventing business rules.

## Payroll (ADM-14)
- **One common monthly cycle.** Preparing, approving and recording payments needs an admin with all-cluster scope (or the Super Admin).
- **Base salary** = Σ(monthly rate × days in segment) ÷ days in month, rounded half up once.
  - A segment is the overlap of a salary period with the employment window (`joined_on` to `exited_on`).
  - Setting a salary that starts inside an already-approved month for that employee is refused.
- **Flags, never deductions:**
  - no salary set
  - part month
  - worker no-shows
  - approved leave
  - pending attendance corrections

  Finance adds *authorised entries* (allowance, incentive, approved overtime, absence or other deduction) with a reason, only while the run is a draft. Deductions can never exceed earnings.
- **Versions:** DRAFT → IN_REVIEW → APPROVED, or RETURNED with a reason. A returned run is kept, and preparing again creates the next version. Changing a run after approval is not allowed (OPEN).
- **Preparer/approver separation is OPEN:** the same admin may currently do both, and both are recorded.
- **Payments:**
  - Recorded only after the actual transfer; approval never marks anyone as paid.
  - Each payment creates exactly one linked salary expense (unique link).
  - Duplicate references are refused, and so is overpayment.
  - Corrections are reversal rows; payments and expenses are append-only.
- **CSV export** is audited and neutralises spreadsheet formulas.

## Escalation (ADM-13)
- **"Relevant Cluster Admin"** = an active, non-Super-Admin admin with `support:edit` whose scope covers the ticket's cluster (X8 interpretation). The Super Admin level notifies every active Super Admin. Notifications are queued by email in the outbox.
- **Deadlines** keep the clock time and skip Sundays and calendar holidays (India time). They stop on resolve or close and restart when a resolved ticket is reopened.

## Still OPEN
- Statutory components (PF/ESI) and their professionally reviewed rules.
- Overtime rates.
- Absence and no-show deduction formulas.
- Corrections after approval.
- Notification delivery adapters (MSG91, Resend, FCM). Rows are queued; nothing is sent yet.
