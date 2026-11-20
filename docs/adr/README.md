# Architecture Decision Records

Short records of decisions that shape the code. Status values: **Accepted** (owner-confirmed or engineering-final), **Provisional** (engineering recommendation pending validation by a spike or first real use).

| ADR | Title | Status |
|---|---|---|
| [001](001-single-company-access-isolation.md) | Single operating company; access isolation and RLS tiering | Accepted (PoC passed 20 Nov 2026) |
| [002](002-separate-admin-and-website-apps.md) | Admin dashboard and Public Website in one Next.js app | Accepted |
| [003](003-background-jobs-pg-boss.md) | Background jobs on Postgres (pg-boss) | Provisional |
| [004](004-money-and-state-integrity.md) | Money as integer paise; explicit state machines | Accepted |
| [005](005-standing-assignments.md) | Standing assignments; eligibility filters; deferred capacity rules | Accepted |
| [006](006-payment-responsibility-split.md) | Razorpay vs Nestovin responsibilities; failure handling | Accepted |
| [007](007-extensible-compensation.md) | Extensible compensation model; no unapproved payroll formulas | Accepted |
| [008](008-iam-style-admin-access.md) | IAM-style admin access: roles + extra grants + per-user scope | Accepted |
| [009](009-per-community-catalogue.md) | Per-community catalogue and price matrix | Accepted |
| [010](010-tooling-baseline.md) | Tooling baseline (pnpm workspaces, TypeScript 6.0, Kysely, Express 5) | Provisional |
| [011](011-community-migration.md) | Community migration (Excel): structure only, all-or-nothing, category column | Accepted |
| [012](012-residents-workforce-languages.md) | Residence proof, family access, worker login, English-only V1 | Accepted |
| [013](013-commercial-rules.md) | Renewal at 100%, unpaid balance kept, refund approval, admin-set slot capacity | Accepted |
| [014](014-payroll-attendance-escalation.md) | Fixed monthly payroll, OTP/QR check-in, 200 m geofence, 2+2 working-day escalation | Accepted |
| [015](015-booking-eligibility-and-pricing.md) | Verified residence to book, one request per flat per cycle, tax-inclusive prices, 14-day booking window | Accepted |
