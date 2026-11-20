# ADR-012: Residence proof, family access, worker login, languages

**Status:** Accepted (owner, 20 Nov 2026). Resolves OD-08 / OPN-02 / OPN-03 (partly), EMP-02 password setup, OD-15 languages.

## Decisions
1. **Residence proof: one document, admin review.**
   - When registering a flat, the resident uploads ONE of: ownership proof (e.g. sale deed), rent agreement, electricity bill, or society ID / allotment letter.
   - An admin with `residents:approve`, whose scope covers the flat's cluster, approves or rejects with a reason.
   - Verification is manual; there is no auto-approval in V1.
   - The first VERIFIED resident of a flat becomes its Primary Resident.
2. **Family members: own login, same household access.**
   - After the Primary Resident's request is approved (with physical verification recorded), the family member signs in with **their own phone OTP**.
   - They can book, pay and raise tickets for that household.
   - **Only the Primary Resident** can add or remove family members.
3. **Worker login: HR issues a temporary password.**
   - The system generates the Employee ID (format `NV-000123`).
   - On "enable login", HR is shown a **one-time temporary password** (never stored in plain text, never shown again).
   - The worker must change it at first login. HR can reset it, which issues a new temporary password and revokes existing sessions.
4. **Languages: English only in V1** for the Resident app, Worker app, Admin portal and website.
   - Copy stays in one place per app, so translations can be added later without code changes to screens.

## Consequences
- **Documents:** `documents.doc_type` values are `OWNERSHIP_PROOF`, `RENT_AGREEMENT`, `ELECTRICITY_BILL` and `SOCIETY_ID`.
- **Family membership:** a family member's `residence_memberships` row is `kind = FAMILY` and links to the Primary's membership. Their access is revoked if the Primary removes them or the Primary's membership ends.
- **Employee auth:** Employee ID logins map to an internal email (`<employee_code>@staff.nestovin.invalid`) in Supabase Auth.
