# ADR-016: Workforce, allocation and attendance defaults (engineering)

**Status:** Accepted (engineering, 20 Nov 2026). Applies ADR-005, ADR-012 and ADR-014 without inventing business rules. Every value below is a setting or an explicit OPEN item.

## Decisions
- **Eligibility filters on every save** (ADR-005): the employee must be:
  - active and READY
  - qualified for the service
  - in the same home cluster
  - not on approved leave
  - free of overlapping visits (also enforced by a database exclusion constraint)
  - within their availability windows
  - within the daily work limit, when one is set

  There is no ranking: Operations chooses from the eligible list.
- **Availability:** an employee with no availability windows is not restricted.
- **Work limit:** `max_visits_per_employee_day` is null (not applied) until Operations supplies a value.
- **Readiness** needs every *required* HR checklist item verified and at least one service qualification. HR configures the checklist; the standards are client-owned.
- **Visits** are generated on a rolling horizon (`occurrence_horizon_days`, default 14). Visit 1 starts at the slot time in the community's timezone.
- **Subscriptions** become `ACTIVE` once every component has a standing worker.
- **Approved leave** releases the visits already assigned inside the leave period, for one-day cover.
- **Worker login** (ADR-012):
  - The internal email is `<employee code>@staff.nestovin.invalid`.
  - The temporary password is shown once.
  - Tokens issued before the last reset are rejected.
  - Until the password is changed, only the profile routes work.
- **Check-in** (ADR-014):
  - The resident code (OTP and QR) is valid for 10 minutes (`attendance_code_ttl_minutes`) and is single use.
  - Five wrong codes void it.
  - Rejected attempts are stored as evidence.
  - Evidence rows cannot be edited; corrections are separate records (ADM-12A).
- **Geofence:** 200 m per community (`communities.geofence_radius_m`). The low-accuracy flag only applies once `gps_accuracy_threshold_m` is approved.
- **Resident no-show:** recorded by the worker after the confirmed 15-minute wait. A worker no-show is recorded by Operations after the visit window.

## Still OPEN
- Times for the 2nd and later visits on the same day (they are created without a time).
- The resident confirmation step for completion. Today, completion is recorded directly.
- Entitlement deduction for no-shows (OPN-22).
- Overtime offers (EMP-08), because the rate and eligibility are not decided.
- Training completion rules (whether it blocks readiness).
