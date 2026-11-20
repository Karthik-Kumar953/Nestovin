# NESTOVIN — Product, Architecture & Development Context
**Document:** `NESTOVIN_CLAUDE_PROJECT_CONTEXT.md`  
**Purpose:** Compact, authoritative working context for Claude Code / Claude Design  
**Prepared by:** Nexif Technologies  
**Context date:** 19 November 2026  
**Product:** Nestovin Home Services & Workforce Platform  
**Tagline:** A Home That Brings People Together

> Read this file before planning, designing, coding, reviewing or modifying Nestovin. Treat it as a project-context summary, not a replacement for the full PRD, workflow specifications, approved SOW, or design-system files.

---

## 1. Product in one paragraph

Nestovin is a company-operated residential home-services and workforce-management platform for high-rise apartments, gated communities and residential societies. Residents request **Maid, Cook and Caretaker** services through a mobile app. Nestovin manages its own workforce, demand collection, plans, payments, scheduling, allocation, attendance, service execution, support and basic payroll. The product is **not an open marketplace**; residents do not browse or select named workers. One shared backend powers the Resident App, Employee App, Unified Admin Portal and informational Public Website.

## 2. Product surfaces

| Surface | Platform | Purpose |
|---|---|---|
| Resident App | Android + iOS | Resident registration, residence verification, service discovery, demand/booking, payment, service status, history, feedback and support. |
| Employee App | Android + iOS | Employee onboarding access, profile, training, assignments, attendance, service completion, availability/leave and notifications. |
| Unified Admin Portal | Web | One shared operational portal. Super Admin controls roles and permissions; other Admin users see and operate only their granted modules/actions and data scope. |
| Public Website | Responsive web | Company and service information plus enquiries; no online service booking. |
| Shared Backend | API + database | Central business rules, identity, permissions, records, integrations, audit and workflow orchestration. |

All product surfaces use the backend as the authoritative source of business state. Do not put critical business rules only in the frontend.

## 3. V1 scope boundaries

### Included services
- Maid
- Cook
- Caretaker

Do not invent, add or imply other V1 service categories.

### Operating model
- Nestovin manages the workforce.
- Residents select an enabled service, plan and permitted time option—not a named employee.
- Workforce allocation is controlled by Nestovin.
- Only feasible, Admin-published slots should be offered.
- The 24×7 ambition is not a V1 availability promise.

### Explicitly excluded from V1
- Open provider/partner marketplace.
- Resident selection of a named employee.
- Public-website booking.
- Additional service categories.
- Full recruitment ATS or enterprise LMS.
- Predictive AI/ML workforce optimisation.
- Automatic cross-cluster employee sharing.
- Continuous/background employee tracking.
- Automated salary disbursement.
- ERP/accounting replacement.
- Unapproved integrations or placeholder screens for deferred modules.

---

## 4. Module map — simple functional understanding

### 4.1 Resident App — 14 capability areas

| # | Module | One-line behaviour |
|---:|---|---|
| 1 | Registration & OTP Login | Resident verifies their phone number and accesses their account. |
| 2 | City & Community Selection | Resident selects a city and then a community. If the city or community is not yet served/onboarded, the resident can submit a one-time expansion-interest vote at the corresponding location level; Super Admin reviews aggregated votes to inform expansion decisions. This vote is not a booking, paid demand commitment or service guarantee. |
| 3 | Residence Registration | Resident submits flat/occupancy details and required proof for verification. |
| 4 | Family Member Management | Primary Resident requests household access; an authorised reviewer verifies and approves or rejects it. |
| 5 | Service Catalogue | Resident views only the enabled Maid, Cook and Caretaker services. |
| 6 | Subscription Plans & Pricing | Resident views eligible plans, entitlements, duration and applicable prices. |
| 7 | Booking & Scheduling | Resident submits a demand-led request or selects a feasible continuous-mode slot. |
| 8 | Payment Integration | Resident pays through Razorpay and sees backend-verified payment status. |
| 9 | Booking & Service Status | Resident tracks demand, payment, booking, subscription, assignment and service states separately. |
| 10 | Service History | Resident views their relevant completed and current service records. |
| 11 | Feedback & Ratings | Resident submits feedback for an eligible completed service. |
| 12 | Support Tickets | Resident raises an issue and tracks its resolution. |
| 13 | Notifications | Resident receives relevant account, demand, booking, payment, service and support updates. |
| 14 | Profile & Household Management | Resident views and updates permitted personal and household information. |

### 4.2 Employee App — 10 capability areas

| # | Module | One-line behaviour |
|---:|---|---|
| 1 | Applicant Registration | Prospective worker submits basic interest details for HR follow-up; this is not a full ATS. |
| 2 | Employee Login | HR-enabled employee signs in using Employee ID and password. |
| 3 | Employee Profile & Qualifications | Employee profile, qualifications and service/task eligibility are maintained. |
| 4 | Training Videos & Completion | Employee views assigned training videos and records completion. |
| 5 | Work Schedule & Assignments | Employee views confirmed routine assignments and required visit details. |
| 6 | Attendance Verification | Employee verifies attendance using configured OTP or QR, with location evidence captured at that event. |
| 7 | Service Completion | Employee submits completion details for an assigned service occurrence. |
| 8 | Additional Work / Overtime | Employee accepts or rejects optional extra-work offers; Admin confirms accepted offers. |
| 9 | Availability & Leave | Employee submits availability or leave requests for authorised review. |
| 10 | Employee Notifications | Employee receives relevant assignment, attendance, training, leave and work updates. |

Routine assignments do **not** require employee accept/reject. That interaction applies only to optional additional-work/overtime offers.

### 4.3 Unified Admin Portal — 14 PRD capability groups

| # | Module | One-line behaviour |
|---:|---|---|
| 1 | Admin Home & Overview | Shows each Admin the operational summary and pending actions permitted by their access. |
| 2 | Admin User, Role & Permission Management | Super Admin creates roles and Admin users, then grants module-level and, where needed, action-level permissions and data scope. |
| 3 | Location / Community Master Data | Maintains the configured City, Community, Cluster, Tower and Flat hierarchy. |
| 4 | Community Migration (Excel) | Imports residential master data, validates it, reports errors and saves approved records. |
| 5 | Resident Management | Authorised Admins review and manage resident and residence records within their scope. |
| 6 | Family-Member Approval | Authorised reviewer records the required verification and approves or rejects family access. |
| 7 | Service, Task, Plan & Pricing Configuration | Authorised users configure the approved services, tasks, plans, entitlements and prices. |
| 8 | Booking, Demand & Payment Status | Admins monitor demand cycles, requests, bookings, payment states and exceptions. |
| 9 | Employee Profile & Verification | HR manages employee profiles, documents, qualifications, training and readiness. |
| 10 | Scheduling & Time-Slot Configuration | Operations configures slots and maintains schedule/capacity information. |
| 11 | Work Allocation & Replacement | Operations reviews allocation recommendations, confirms eligible assignments and manages replacements. |
| 12 | Attendance & Service Records | Authorised users review attendance evidence, service completion and correction/no-show exceptions. |
| 13 | Support Ticket Management | Support users manage resident issues and website enquiries within their permissions. |
| 14 | Finance & Basic Payroll | Payroll/Finance users review financial summaries, prepare payroll calculations and complete authorised approval/reporting. |

**Counting note:** The PRD v1.1 intentionally defines 14 Admin capability groups. Earlier scope listed Finance Overview/Basic Payroll Calculation and Payroll Approval/Basic Reports separately; the PRD combines them into one Finance & Basic Payroll group while retaining the included behaviours. Do not re-expand this to 15 unless the product owner changes the scope.

### 4.4 Public Website

Informational and enquiry-led website covering the company, the three approved services, how it works, about/contact, FAQs, legal information and informational careers content. Enquiries are stored and routed to the approved Support destination. No online booking, career application system, general CMS or CRM is included in V1.

---

## 5. Unified Admin Portal — critical role and permission model

This is a core architectural concern. Do not simplify it into six hard-coded dashboards or fixed role packages.

### 5.1 Super Admin

- Super Admin has complete, platform-wide access to all Admin modules and authorised actions.
- Super Admin creates and manages role definitions (for example, Community Admin, Cluster Admin, HR, Operations, Support, Payroll or other roles required by the business).
- Super Admin creates/invites Admin users and assigns one or more created roles to each user, according to the approved product policy.
- Super Admin configures the modules each role/user can access and, where required, the actions allowed inside each module.
- Super Admin assigns applicable data scope, such as permitted cluster(s).
- Super Admin can review and change role/permission configuration; these changes must be audited.
- Super Admin's own actions are also subject to backend validation and audit.

### 5.2 Roles are configurable, not hard-coded permission bundles

Role names such as Community Admin, Cluster Admin, HR, Operations, Support and Payroll are examples/categories of operational responsibility—not automatic grants of fixed access.

The permission model must allow the Super Admin to:
1. Create a role.
2. Give the role a name and description.
3. Select the Admin modules that role can access.
4. Configure permitted actions within each selected module where action-level restrictions are required.
5. Set applicable data scope, such as assigned cluster(s), where relevant.
6. Assign the role to one or more Admin users.
7. Update or revoke role grants later, with audit history.

A user's effective access is determined by their assigned role grants and any explicitly supported user-level overrides. Do not assume overrides/inheritance behaviour beyond what is confirmed; document and validate that policy before implementation.

### 5.3 Permission dimensions

Keep these dimensions separate:

| Dimension | Question it answers | Example |
|---|---|---|
| Identity/account status | Who is signed in, and is the account active? | Active Admin account |
| Role assignment | Which configurable role(s) are assigned? | Community Admin + Support |
| Module permission | Which Admin modules can they open/use? | Resident Management, Support |
| Action permission | What can they do inside each module? | View, Create, Edit, Approve, Export |
| Data scope | Which records can they operate on? | One or more assigned clusters |
| Record-level rules | Is this particular record/action allowed? | Cannot approve a record outside assigned scope |

The exact action vocabulary and role-to-module matrix must be configurable and approved. Do not infer that every module needs every action.

### 5.4 Backend authorisation sequence

For every protected API request:
1. Authenticate the user and validate active account/session.
2. Resolve current role assignments and permission grants.
3. Check access to the requested module.
4. Check the requested action.
5. Check tenant, cluster and record ownership/data scope.
6. Apply any additional approval or step-up authentication rule.
7. Allow or deny; audit sensitive changes and decisions.

Frontend navigation should hide modules the user cannot access, but **frontend hiding is not security**. The backend must independently enforce every check. Database RLS and query constraints must reinforce the same boundaries.

### 5.5 Permission safety rules

- A role/user must not grant permissions beyond the grantor's authority.
- A Cluster Admin cannot change their own cluster scope or access another cluster by changing a request parameter.
- Support must not see HR/payroll documents unless explicitly authorised.
- Payroll must not see unrelated HR documents.
- HR controls employee readiness/verification fields only where granted.
- Deactivated users lose access promptly.
- Role, module, action and scope changes are audited.
- Test direct API calls, guessed IDs, exports, writes and cross-cluster/cross-tenant access—not only visible menus.

**Important distinction:** The PRD supports configurable per-user module access, optional action restrictions and separate data-scope enforcement. The user's clarified operating intention is that Super Admin creates reusable roles and grants access through those roles. Implement that as the intended role-management model, while keeping unresolved inheritance/override details explicit rather than guessing.

---

## 6. Main business workflows

### Location expansion voting — separate from demand collection

Nestovin has a location-level expansion-interest voting flow that must be represented explicitly in the Resident App and Admin workflows. It is distinct from demand collection, booking and slot selection.

**Scenario A — selected city is not currently served**
1. Resident selects or searches for a city that is not currently available for onboarding/service.
2. The app offers the resident an option to register interest/vote for Nestovin to enter that city.
3. A resident may submit only one vote for the same city. The backend must enforce duplicate prevention; a client-side restriction alone is insufficient.
4. The vote is stored as a city-level expansion-interest record.
5. Super Admin can review aggregated city-level vote counts and use them as an input when deciding whether to approach/expand into that city.

**Scenario B — city is served, but the resident's community is not onboarded**
1. Resident selects a city where Nestovin is available.
2. The required residential community is not present/onboarded in the available community list.
3. The app offers a separate option to register interest/vote for Nestovin to approach/onboard that community.
4. A resident may submit only one vote for the same community. The backend must enforce duplicate prevention.
5. The vote is stored as a community-level expansion-interest record.
6. Super Admin can review aggregated community-level vote counts and use them as an input when deciding whether to approach/onboard that community.

**Business boundaries**
- City-level votes and community-level votes are separate records and retain their respective location references.
- These votes express interest in potential expansion. They are not paid demand commitments, demand-cycle submissions, bookings, slot reservations or proof of service availability.
- Voting does not automatically trigger expansion, create a community, publish slots, guarantee launch or activate service. Super Admin reviews the signals and makes the expansion decision.
- The vote identity key, withdrawal/change policy, status lifecycle, notifications, reporting filters and eligibility rules must be confirmed during workflow correction if not already specified by the owner.
- Do not merge these flows with demand-led mode's configurable initial payment percentage or with continuous-mode live capacity/slot selection.

**Documentation correction required:** The current individual and integrated workflow drafts do not adequately capture this voting workflow. Their unavailable-location contact/unavailable states are incomplete for this requirement. This project context records the confirmed behaviour; the source workflow documents must be corrected before implementation begins.


### 6.1 Resident registration and household access
Phone OTP → select city/community → submit residence/flat details and proof → verification → activate resident-to-residence association → optional family access request → required physical verification outside the app → authorised approval/rejection → enable only permitted family access.

A pending residence or family request does not grant verified household access.

### 6.2 Service configuration
Authorised Admin configures the three V1 services, tasks, plans, entitlements, duration, prices and community availability → validates and publishes versioned configuration → Resident App displays only currently eligible options.

### 6.3 Demand-led operating mode
1. Super Admin configures the initial commitment percentage for a specific demand cycle.
2. That percentage is validated and locked when the cycle is published.
3. Residents submit demand details and pay the configured initial commitment.
4. Backend verifies payment; paid commitments are aggregated.
5. Operations reviews demand and workforce capacity.
6. Slots and commencement date are prepared and approved by Admin.
7. Residents are notified of the remaining balance and deadline.
8. Backend verifies the remaining payment.
9. Only when the required full payment is verified does the subscription/service activate and proceed to allocation.

The initial percentage is **not a hard-coded 30%**. The permitted numeric range and exact field validation remain subject to final approval. Never assume a 30/70 split.

### 6.4 Continuous operating mode
Operations maintains employee readiness, availability and assignments → backend calculates feasible slots → Resident selects a published slot → backend revalidates capacity → Resident pays 100% → backend verifies payment → booking is confirmed → allocation proceeds.

### 6.5 Shared workforce allocation
A paid/service-ready booking produces an allocation requirement → backend filters employees by service/task qualification, readiness, availability, existing assignments and authorised cluster scope → system recommends eligible candidates → Operations reviews and confirms or selects another eligible employee → backend validates conflicts/scope → assignment is saved and employee is notified.

No eligible worker means a capacity gap for Operations to resolve; do not silently assign an unqualified or out-of-scope employee.

### 6.6 Attendance and service execution
Confirmed assignment appears in Employee App → employee verifies attendance by configured OTP or QR → event-based location evidence is captured → backend validates and stores attendance → employee performs tasks and submits completion → resident confirmation is captured when required → service record/status/history updates → authorised Admin and payroll workflows can use approved records.

No continuous/background employee tracking.

### 6.7 Support, notifications and payroll
- Resident tickets and website enquiries are stored and routed to an authorised Support destination; they remain distinct records unless a conversion rule is approved.
- Notifications are sent after the underlying business event is committed; notification delivery does not itself change business state.
- Payroll uses verified payment/booking summaries and approved attendance/service/additional-work inputs with client-approved rates and deductions; it does not disburse salaries.

---

## 7. Confirmed technical stack

Use this stack as the current engineering baseline. Do not substitute technologies without a documented reason and approval.

| Layer | Technology | Responsibility |
|---|---|---|
| Resident App | React Native + Expo + TypeScript | Android/iOS resident experience |
| Employee App | React Native + Expo + TypeScript | Android/iOS employee experience |
| Web application (Public Website + Unified Admin Portal) | Next.js + React + TypeScript | One web application with separate public and protected Admin route groups, shared UI/design-system packages and shared API client. Public pages use SEO-appropriate rendering; Admin pages use authenticated, data-driven application patterns. |
| Backend | Node.js + TypeScript + Express | Custom API and authoritative business logic |
| Architecture | Modular monolith | Domain-separated modules in one deployable backend initially |
| Database | Supabase-managed PostgreSQL | Primary system of record |
| Authentication | Supabase Auth | Authentication/session provider; backend still authorises every business action |
| File storage | Supabase Storage | Private residence and employee documents with controlled access |
| Tenant/data isolation | PostgreSQL RLS + backend authorisation | Tenant and record-scope isolation |
| Payments | Razorpay | Payment orders, checkout and provider verification |
| Push notifications | Firebase Cloud Messaging direction | Mobile push delivery |
| Maps/location | Google Maps Platform where justified | Address/geocoding/map support where required |
| OTP/SMS | Provider not yet selected | Phone OTP and transactional SMS |
| Email | Provider not yet selected | Transactional email if required |

### Web application architecture decision

**Recommended direction: consolidate the Public Website and Unified Admin Portal into one Next.js + React + TypeScript web application.** The previous split of Next.js for the Public Website and React + Vite for the Admin Portal is superseded by this recommendation.

- Use one Next.js application and deployment for the public and Admin web surfaces, with distinct route groups/layouts (for example, public routes at `/` and `/services`, protected Admin routes under `/admin`).
- Reuse design tokens, components, validation schemas, typed API clients and shared frontend utilities where appropriate.
- Public pages can use static/server rendering for SEO and performance; Admin pages can use authenticated, interactive client-side experiences where appropriate.
- A single domain and route structure do not themselves make applications communicate. Both web surfaces communicate with the shared backend through documented APIs.
- The backend remains a separate Node.js + TypeScript + Express modular monolith and the source of truth. Resident and Employee mobile apps remain React Native + Expo + TypeScript clients of the same backend.
- Keep backend authentication and authorisation authoritative. Next.js middleware, route guards and hidden navigation are supplementary UX controls, not security boundaries.
- Separate web deployments or subdomains should be considered only if a concrete operational, security or scaling requirement justifies the added complexity.

### Architecture principles
- Start with a **modular monolith**; do not introduce microservices without demonstrated need.
- PostgreSQL is the system of record.
- Keep authoritative business rules in the custom Node.js backend.
- Use Supabase services selectively; do not scatter core business logic across client SDKs, triggers and unrelated serverless functions.
- Use versioned database migrations.
- Use database transactions and constraints for payment, demand, booking and allocation invariants.
- Put external providers behind adapters (Razorpay, OTP/SMS, push, maps, storage).
- Use background jobs for retryable webhooks, notifications and scheduling where needed.
- Add Redis, a separate queue or other infrastructure only when justified by measured load/operational needs.
- Maintain separate development, staging and production environments.
- Keep secrets out of client bundles, mobile apps, source control and logs.

### Tenant and cluster are different concepts
- Tenant/operating organisation is the organisation-level data-isolation boundary.
- Residential community is the apartment/society where residents live.
- Service cluster is Nestovin's internal operational grouping.
- Do not automatically equate one community with one tenant or one cluster.
- Tenant-owned rows must carry the correct tenant reference.
- Cluster-scoped records must be restricted to assigned cluster(s).
- Foreign keys must not allow cross-tenant record linking.
- RLS and backend authorisation both apply; RLS does not replace backend checks.
- Negative tests must cover cross-tenant and cross-cluster reads, writes, exports and direct-ID lookups.

### Backend domain modules (suggested boundaries)
1. Identity, authentication and access control.
2. Tenant/organisation and location master data.
3. Resident and household.
4. Service catalogue, tasks, plans and pricing.
5. Demand cycles and demand requests.
6. Booking, subscription and payment.
7. Workforce and HR.
8. Scheduling and allocation.
9. Attendance and service sessions.
10. Support and website enquiries.
11. Finance and payroll.
12. Notifications.
13. Audit and configuration history.

These are domain boundaries within the modular monolith, not separate microservices.

---

## 8. Data and business integrity rules

- Keep demand request, booking, subscription, payment attempt, payment transaction, service occurrence, assignment, attendance event and service completion as distinct concepts/records.
- A demand commitment is not a confirmed booking and does not activate service.
- The backend calculates payment amounts and verifies provider payment status.
- A client-side success screen or payment redirect is not proof of payment.
- Verify Razorpay order, amount, currency, purpose, provider signature/webhook and internal record references.
- Process webhooks idempotently; duplicate events must not create duplicate financial or business effects.
- Store financial history in an append-oriented manner; corrections/refunds are separate authorised actions with reason and audit history.
- Capture a configuration snapshot for each demand commitment/booking so later price/percentage/plan changes do not rewrite existing terms.
- Only publish feasible slots.
- Allocation must enforce qualifications, readiness, availability, assignment conflicts and cluster scope.
- Attendance corrections preserve the original event and record the correction decision.
- Notifications never act as proof of payment, booking or service completion.
- Audit privileged actions and sensitive changes.

---

## 9. Security and privacy requirements

Highest-risk areas: money, privileged Admin actions, resident/household access, employee documents, tenant/cluster isolation, attendance evidence and payroll.

- Resident phone OTP must be short-lived, one-time and rate-limited.
- Employee accounts are enabled through authorised HR workflow.
- Admin accounts need stronger protection; MFA is strongly recommended, and required for Super Admin/financially sensitive roles before production approval.
- Check module, action, tenant, cluster and record ownership on every protected backend request.
- Never trust a user-supplied role, cluster ID, tenant ID or ownership field.
- Store residence and employee documents privately; avoid permanent public URLs.
- Use short-lived signed access where appropriate.
- Validate upload type, extension, size and metadata server-side.
- Mask sensitive identifiers in normal screens and logs.
- Define retention, privacy, consent and recovery policies before production.
- Audit role/permission changes, demand-cycle publication, payment configuration, financial adjustments, employee readiness, allocation overrides, attendance corrections, payroll changes and sensitive document access.

---

## 10. Development strategy

### Agreed approach: correct the requirements first, then backend-first—not frontend-blind

**Development must not begin until the individual module workflows and integrated complete-system workflows have been corrected and reviewed against the confirmed product decisions.** In particular, restore the city/community expansion-voting paths and distinguish them from paid demand collection and slot/booking workflows. After that requirements correction and approval, build the shared foundation and business logic first, while defining API contracts and validating workflows with basic functional interfaces. Do not spend early development time polishing every screen. Do not build the entire backend in isolation and only then discover that the frontend and API/data model do not fit.

### Development phases

1. **Architecture and database foundation** — repository structure, environment configuration, database connection, migrations, domain model, tenant/cluster model, RLS, logging, validation and error handling.
2. **Backend core** — identity, access control, master data, business modules, APIs, integrations and audit.
3. **Functional frontend** — connect essential Resident, Employee and Admin flows using agreed API contracts; visual polish is not the priority yet.
4. **Integration and testing** — end-to-end workflows, permissions, payments, data isolation, edge cases and regression tests.
5. **Premium UI/UX implementation** — apply approved Claude Design output and the Nestovin design system consistently.
6. **Production readiness** — security review, performance, monitoring, backups, deployment, provider configuration and acceptance.

### First milestone
Build and prove:
- Repository/application foundation.
- PostgreSQL schema and versioned migrations.
- Tenant/organisation, community and cluster modelling.
- RLS and backend scope enforcement.
- Authentication and session integration.
- Configurable role, module, action and data-scope permission foundation.
- Audit trail for privileged access changes.
- Automated negative tests proving that unauthorised access is denied.

### Backend workstream order
**A. Foundation:** repo structure, config, DB, migrations, tenant/organisation model, RLS, logging, validation, error handling.

**B. Identity and access:** authentication, Resident/Employee/Admin identities, Super Admin role management, role assignment, module/action grants, cluster scope, audit.

**C. Resident and commercial foundation:** location master data, residence verification, household, service catalogue, tasks, plans, entitlements, pricing and versioned configuration.

**D. Core business engine:** demand cycles, demand requests, configurable locked commitment percentage, payment/Razorpay, booking/subscription, slots, scheduling and allocation.

**E. Workforce:** employee profiles, qualifications/readiness, training assignments, availability/leave, attendance, service completion, resident confirmation and basic payroll inputs.

**F. Supporting systems:** notifications, support tickets, website enquiries, Excel migration, reporting and exports.

Do not start dependent workflows before their required foundations and permission boundaries are stable.

---

## 11. Claude Code project skills

The project previously established a six-skill structure. Reuse the existing skill files rather than creating a new skill for every module:

- `.claude/skills/system-architect/SKILL.md`
- `.claude/skills/backend-developer/SKILL.md`
- `.claude/skills/frontend-developer/SKILL.md`
- `.claude/skills/fullstack-developer/SKILL.md`
- `.claude/skills/qa-tester/SKILL.md`
- `.claude/skills/code-reviewer/SKILL.md`

Also retain the existing installation guide and prompt templates if present in the repository.

Use skills as focused working instructions, not as a replacement for this project context, the PRD, workflow specs, architecture decisions or tests. Do not assume the skill files' exact contents from this summary; inspect the repository before modifying them.

---

## 12. UI/UX direction and Claude Design guardrails

Use Claude Design for design exploration and screen/prototype work. The approved Nestovin design system is the visual authority.

### Fixed brand identity
- Primary Teal: `#00897B`
- Primary Green: `#43A047`
- Background Mint: `#F5FAF9`
- Charcoal: `#111827`
- Typography: **Manrope** for headings/display; **Inter** for body/interface.
- Tagline: **A Home That Brings People Together**
- Preserve approved logo geometry, proportions and colours. Do not redraw or invent logo variants.

### UI principles
- Premium, dependable, calm, human, modern and organised.
- Clarity before decoration; one dominant action; progressive disclosure.
- Show truthful status for verification, demand, payment, booking, assignment and service.
- Use readable tables for repetitive Admin data.
- One unified Admin Portal; do not design separate HR/Operations/Support/Payroll applications.
- Filter Admin navigation by Super Admin-assigned module access, but enforce actions and data scope in the backend.
- Target WCAG 2.2 AA; design for readable contrast, persistent labels, visible focus, text scaling, screen readers and adequate touch targets.
- Use white/mint surfaces, restrained teal/green accents, consistent line icons and warm, respectful residential imagery.
- Avoid gradients, excessive shadows, glassmorphism, decorative clutter and unnecessary motion.

### Claude Design must not invent
- Services, plan names, prices, entitlements, task coverage or policies.
- A fixed 30%/70% payment split.
- Treating city/community expansion-interest votes as paid demand commitments, bookings or slot reservations.
- Resident choice of named employee.
- Instant service promises or unavailable slots.
- Online website booking.
- Live employee tracking.
- Deferred Admin modules or unapproved integrations.

Design should follow approved workflow states and data; do not let visual convenience change business rules.

---

## 13. Open decisions — do not silently invent answers

The PRD records these as unresolved or requiring final client/business approval:

1. Final service/task matrix for Maid, Cook and Caretaker.
2. Final plans, residence categories, price matrix, entitlements and validity.
3. Permitted range and exact validation for the Super Admin-configured demand-cycle percentage.
4. Demand collection window, balance deadline, reminder schedule and expiry/refund/forfeiture treatment.
5. Fixed slot definitions, durations, buffers and whether residents can choose among multiple slots.
6. No-worker/capacity-gap handling and resident alternative-slot process.
7. Employee capacity, backup pool, workload and travel/buffer rules.
8. Residence proof types, automated/manual verification criteria and residence-change process.
9. OTP/QR lifecycle, geofence/accuracy thresholds, offline exceptions and resident-confirmation policy.
10. Exact RBAC matrix, cluster hierarchy/cardinality and Super Admin delegation policy.
11. Payroll formulas, rates, overtime/incentives, deductions, statutory handling and approval separation.
12. Support categories, statuses, response targets and approved website enquiry destination.
13. OTP/SMS, push, email, maps and hosting provider accounts/ownership.
14. Data retention, privacy notice, location/document consent, legal policy and recovery objectives.
15. Supported languages, currency/date conventions, browser/device versions and expected load.

The initial payment percentage itself is not an open design choice: it is configured by Super Admin per demand cycle and locked at publication. Its allowed numeric range/validation remains open.

---

## 14. Source-of-truth hierarchy and files

When sources disagree, do not silently merge conflicting rules. Identify the conflict and ask for a decision.

1. **Accepted SOW and MSA** — contractual scope, commercial commitments and change control.
2. **Nestovin PRD v1.1 — Engineering Baseline (19 November 2026)** — current product/engineering requirements and reconciled business rules.
3. **Individual Module Workflows (NV-FWS-01, v0.1)** — detailed module-level functional flows; working draft.
4. **Complete System Workflows (NV-FWS-03, v0.1)** — cross-module end-to-end flows; working draft, not final approval.
5. **Nestovin Product Design System (NV-DS-01, v1.1)** and `DESIGN.md` — visual and interaction design rules.
6. **Nestovin Brand Kit** — approved logo, brand identity, palette and typography.

Relevant shared files:
- `Nestovin_PRD_v1.1_Engineering_Baseline.md`
- `01_individual_module_workflows.md`
- `01_individual_module_workflows_diagrams.md`
- `03_complete_system_workflows.md`
- `Nestovin_Product_Design_System_v1.md`
- `Nestovin_Design_System_v1.0.md`
- `DESIGN.md`
- `Nestovin_Brand_Kit.pdf`

The workflow documents are version 0.1 working drafts. The PRD v1.1 is itself marked as a working product baseline requiring business-owner approval before it becomes the frozen delivery specification. Preserve this status.

### Known stale content to watch for
Older workflow diagrams still show 30% commitment / 70% balance. This is superseded by PRD v1.1 and the later decision: Super Admin sets the initial percentage per demand cycle; it locks at publication. Never reintroduce hard-coded 30/70 logic.

---

## 15. Working instructions for Claude

Before changing code or design:

1. Read this file and the relevant full source document(s).
2. Identify the exact module, workflow and acceptance criteria involved.
3. Check existing repository structure, conventions, migrations, skills and tests before proposing changes.
4. Identify dependencies and permission/data-scope implications.
5. State assumptions and unresolved decisions; do not fabricate business rules.
6. Prefer small, reviewable, tested increments.
7. Keep API contracts, database constraints, backend rules and UI behaviour aligned.
8. Add tests for happy paths, failure paths, permission boundaries, duplicate events and cross-scope access.
9. Update architecture decisions/documentation when a technical decision changes.
10. Do not claim a feature is complete because a screen or endpoint exists; verify the full workflow and acceptance criteria.

**Default engineering posture:** secure, tenant-aware, auditable, modular, configuration-driven, testable and deliberately simple. Build what the V1 requirements need—do not over-engineer or expand scope.
