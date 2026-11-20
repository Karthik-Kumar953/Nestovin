# ADR-011: Community migration (Excel) rules

**Status:** Accepted (owner, 20 Nov 2026). Resolves the OPEN points in Final workflow ADM-04.

## Decisions
1. **Structure only, no personal data.** The workbook carries the residential structure:
   - Tower
   - Floor
   - Flat number
   - BHK type
   - Area (sq ft)
   - Residence category
   - Occupancy (Owner / Tenant / Vacant)

   Residents' names and phone numbers are **not** imported. Residents self-register in the app and are verified there (OD-08 / I2 closed for V1).
2. **All-or-nothing.** A batch is committed only when it has zero blocking errors. Fix the file and upload a new batch; the system keeps the batch history (`supersedes_batch_id`).
3. **Same admin may upload and approve.** Any admin with `community_migration:approve` may approve, including the uploader. Every step (upload, approve, reject, commit) is audited.
4. **Pricing category comes from the workbook.** The "Residence category" column must match a category already defined for that community in the setup wizard. Admins can change a flat's category later in the UI.

## Consequences
- **Wizard order:** residence categories are defined **before** the import, because the import validates against them.
- **Import target:** imports add towers and flats to an existing community (created in Locations). A commit moves a DRAFT community to IMPORTED. It does **not** activate the community.
- **Re-imports** are allowed and are idempotent by natural key (tower name + flat number):
  - existing flats are updated
  - new ones are added
  - flats missing from the file are left untouched (never deleted)
- **Limits:** `.xlsx` only, max 5 MB, max 20,000 rows. The original file's SHA-256 and name are recorded. The file itself is not stored in V1.
