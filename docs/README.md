# Nestovin documentation index

Which document to trust for what. When documents disagree, the higher row wins unless an ADR in `docs/adr/` records a later owner decision.

## Current (authoritative)

| Document | Use for |
|---|---|
| `adr/` | Architecture decisions confirmed during the Nov 2026 review. These override older wording in the documents below. |
| `architecture/data-model.md` | Complete database design for all V1 modules (built and planned) |
| `architecture/api-design.md` | API conventions and the endpoint catalogue for all four audiences |
| `Architecture/Nestovin_Individual_Module_Workflows_v1.0_Final.md` (NV-FWS-01 v1.0) | **Final call on all functional flows** |
| `Architecture/Nestovin_PRD_v1.1_Engineering_Baseline.md` (NV-PRD-01 v1.1) | Product scope, business rules, security and acceptance tests where the Final workflows are silent |
| `Design/DESIGN.md` + `Design/Nestovin_Product_Design_System_v1.md` (NV-DS-01 v1.1) | Design tokens and UI rules |
| `Design/Nestovin_Brand_Kit.pdf`, `Design/Nestovin_logo.*` | Brand assets |
| `Design/design_screens/*.png` | Resident App mockups (reference for the Resident design pass) |

## Reference only (do not implement from these)

| Document | Why |
|---|---|
| `Architecture/Subscriptions Example.md` / `.pdf` | Illustrative pricing structure only. Every community's catalogue and prices are configured in the Admin Portal (ADR-009). Never seed as data. |
| `Architecture/NESTOVIN_CLAUDE_PROJECT_CONTEXT.md` | Useful summary. Its single Next.js app for admin + website is confirmed (ADR-002) and its reusable-roles model is confirmed (ADR-008). Superseded in: tenant wording (ADR-001) and the source list citing v0.1 workflows. |

## Superseded

| Document | Superseded by |
|---|---|
| `Architecture/01_individual_module_workflows.md` (v0.1) | Final workflows v1.0 (fixed 30/70 split and role-based permissions are wrong) |
| `Architecture/01_individual_module_workflows_diagrams.md` (v0.1) | Final workflows v1.0 |
| `Architecture/03_complete_system_workflows.md` (v0.1) | Final workflows v1.0 + `adr/` + generated OpenAPI + `architecture/sequences.md` (to be written per phase). Contains a hard-coded 30/70 split and "retain 30% on expiry", which is not an approved rule. |
| `Design/Nestovin_Design_System_v1.0.md` | NV-DS-01 v1.1 + `DESIGN.md` (v1.0 hard-codes the 30/70 split in UI copy) |
