# ADR-014: Payroll basis, attendance proof, geofence, support escalation

**Status:** Accepted (owner, 20 Nov 2026). Resolves C7 in part (OD-11), OD-09 in part, and the ADM-13 escalation deadlines.

## Decisions
1. **Payroll: fixed monthly salary only in V1.**
   - Finance records each worker's monthly amount, with effective dates.
   - A partial month (joining or leaving mid-month, or a rate change) is **prorated by calendar days**.
   - Daily and hourly types stay in the extensible model (ADR-007) but are not enabled.
   - **Still OPEN:** deductions for absences or no-shows (OPN-22), overtime rate, and statutory components. Until these are approved, payroll lines flag them and Finance adds authorised manual entries.
2. **Attendance proof: resident OTP or QR.**
   - The resident's app shows a short-lived 6-digit code and a rotating QR for the visit.
   - The worker either enters the code or scans the QR.
   - Both are single-use and expire.
3. **Geofence: 200 m default, configurable per community.**
   - GPS is captured once at check-in, as supporting evidence only.
   - A check-in farther than the radius from the community's reference pin, or with poor accuracy, is **flagged for review, never blocked**.
4. **Support escalation: 2 + 2 working days.**
   - An unresolved ticket escalates to the relevant Cluster Admin after 2 working days.
   - It escalates to the Super Admin after 2 more working days.
   - Urgent tickets go straight to the Cluster Admin.
   - Working days exclude Sundays and the holidays on the organisation-wide calendar, which the Super Admin maintains.
