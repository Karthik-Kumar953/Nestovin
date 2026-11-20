# ADR-007: Extensible compensation model; no unapproved payroll formulas

**Status:** Accepted

## Confirmed V1
- One common monthly cycle; pay calculated per employee.
- Review and approval in Nestovin.
- Manual bank transfer outside Nestovin. The admin then records the actual payment (amount, date, method, reference). Status is Pending / Partially Paid / Paid.
- Each salary payment creates or links exactly one salary expense entry, enforced by a unique constraint.
- Payroll and payment history is kept.

## Decision
- `compensation_profiles(employee, type, rate, effective dates, approved_by)`, extensible by type:
  - `FIXED_MONTHLY` needs a partial-month rule (OPEN).
  - `DAILY` needs a definition of a payable day (OPEN).
  - `HOURLY` needs a payable-hours source and rounding rule (OPEN).
- `compensation_components` catalogue (overtime, allowance, incentive, statutory…). **Each component is inactive until its rule is approved.** Employer contributions are never employee deductions.
- Payroll line items reference their source records. Only approved attendance and approved overtime may be inputs. Lines with missing inputs or rules are flagged, never guessed.
- Approved runs are immutable; corrections create a new version or an authorised adjustment.
