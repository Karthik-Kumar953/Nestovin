# ADR-008: IAM-style admin access

**Status:** Accepted (owner, 20 Nov 2026). This supersedes PRD v1.1 "role templates" and the Final workflow's "roles are labels only" wording.

## Context
There is one unified Admin Portal and no per-role dashboards. The owner's model works like AWS IAM: the root user creates identities, and each identity sees the same console restricted to the services granted to it.

## Decision
- **Super Admin = root.** Bypasses grant checks but **not** validation or audit. Only Super Admins manage roles, admins and scopes (the `admin_access` module is not grantable).
- **Roles** are reusable bundles of `(module, action)` grants that Super Admin creates and edits. Starter roles (HR, Operations, Payroll, Finance, Support, Cluster Admin) may be seeded as ordinary, editable roles.
- **Admins** get zero or more roles plus optional **per-user extra grants**.
- **Effective permissions** = union of role grants + extra grants. **Allow-only, with no deny rules** in V1. The Final workflow leaves precedence OPEN, and allow-only is the simplest safe choice.
- **Data scope is always per admin:** `GLOBAL` or specific clusters. It is never attached to a role, so the same role can serve different clusters.
- The permission catalogue (14 modules × allowed actions) lives in `packages/contracts/src/permissions.ts`. The DB seed must match it, and a test enforces this.
- **Guards:**
  - no self-edit of roles, grants or scope
  - the last active Super Admin cannot be disabled or demoted
  - every change is audited with before/after
  - changes take effect on the next request; no permission cache initially
- **Admin MFA (TOTP) is mandatory** before any admin API call (AAL2).
