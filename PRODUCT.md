# Product

<!-- impeccable:product-schema 1 -->

## Platform

web (Admin Portal and Public Website, one Next.js app at `apps/web`). The Resident and Worker apps are Expo (iOS/Android) under `apps/resident` and `apps/employee`.

## Users

- **Admin staff of Nestovin** (one operating company): Super Admin, plus staff whose access comes from reusable roles (HR, Operations, Payroll, Finance, Support, Cluster Admin) and per-person extra grants. Each admin also has a data scope: all clusters, or specific clusters. They work on laptops and desktops through the working day, and often on phones or tablets too (owner confirmed), so every screen must work fully at phone width. They move between queues (verifications, tickets, imports, payroll) and setup work (communities, plans, prices).
- **Residents** of gated communities in India who subscribe to Maid, Cook and Caretaker (add-on) services through the Resident app.
- **Workers** (employees) who see their schedule, check in with OTP/QR and location, and request leave through the Worker app.
- **Public visitors** to the website, who can read and send an enquiry only.

## Product Purpose

Nestovin runs managed home services (Maid, Cook, Caretaker) inside gated communities. The Admin Portal is where the company onboards communities, sets per-community plans and prices, takes demand and payments, readies and allocates workers, verifies attendance, handles support, and runs monthly payroll. Success: every operational step is done in the portal, correctly, by the right person, with an audit trail, and nobody has to guess where a flow lives.

## Positioning

Managed, salaried, verified workers allocated per community, not a marketplace of freelancers. Demand-led cycles let a community commit before Nestovin staffs it.

## Operating Context

- Physical structure: City → Community (a gated community) → Tower → Flat.
- Operational structure: a **Cluster** is a group of one or more communities. A community belongs to exactly one cluster at a time; moves are kept as history. Admin data scope is set per admin, by cluster.
- Community onboarding: create community → import structure (Excel template or typed grid) → approve → commit → residence categories, services, time windows, tasks → plans and price matrix → publish → activate.
- Money is in paise, server-authoritative; Razorpay processes payments, Nestovin owns the state.
- Monthly payroll, one common cycle; salary paid by bank transfer outside Nestovin and recorded in the portal.

## Capabilities and Constraints

- 14 admin modules (ADM-01 to ADM-14), one unified portal; navigation shows only what a person's grants allow; counts and lists respect cluster scope.
- High-impact actions (publish, commit, approve, activate, reverse, release) need explicit confirmation; some need MFA step-up.
- Payroll: the preparer and the approver must be different people (owner decision, Nov 2026).
- Support tickets can be assigned to other admins within scope and show linked flat, booking, payment and visit.
- Out of V1: non-salary expenses, website booking, marketplace, ATS/LMS/CRM.
- Undecided (do not invent): capacity and headcount formulas, allocation ranking, overtime rates, refund/forfeiture policy.

## Brand Commitments

- Name: Nestovin. Logo: `docs/Design/Nestovin_logo.png`.
- Brand teal `#00897B` (filled text-bearing buttons use `#00796B` for AA contrast), secondary green `#43A047`, charcoal `#111827`.
- Fonts: Manrope (headings) and Inter (body/UI).
- Copy: sentence case, plain English, no emoji.
- Icons: lucide (owner request). Charts: Recharts, animated (owner request).

## Evidence on Hand

- Product docs: `docs/Architecture/Nestovin_PRD_v1.1_Engineering_Baseline.md`, `docs/Architecture/Nestovin_Individual_Module_Workflows_v1.0_Final.md` (final authority on flows), ADRs in `docs/adr/`.
- Brand: `docs/Design/DESIGN.md`, `docs/Design/Nestovin_Brand_Kit.pdf`.
- Dev data: demo community "Green Meadows (Demo)". No real customer metrics, testimonials or revenue figures exist; dashboards must show live data or clearly labelled empty states, never invented numbers.

## Product Principles

1. Every flow is findable from the sidebar; nothing important hides inside another screen.
2. The person's scope is the truth: never show a number or row outside it.
3. Money and approvals are deliberate: confirm, record who did it, keep history.
4. Queues first: an admin opening the portal should see what needs them today, with analytics beneath (owner confirmed).
5. Do not invent business rules; show "not decided" rather than a guess.

## Accessibility & Inclusion

WCAG 2.2 AA: 4.5:1 text contrast, visible focus, full keyboard use of tables, dialogs and forms; respect reduced motion for chart animation.
