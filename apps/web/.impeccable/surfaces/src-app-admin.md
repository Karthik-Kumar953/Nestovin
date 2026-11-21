---
version: 1
slug: "src-app-admin"
primary_target: "src/app/admin"
related_targets: ["src/admin"]
---

# Admin Portal (apps/web /admin)

Mode: Operate. Audience: Nestovin staff (Super Admin, HR, Operations, Payroll, Finance, Support, Cluster Admin) on laptops all day and often on phones. Job: clear today's queues, run community onboarding, demand, allocation, attendance, support and payroll correctly within their grants and cluster scope.

Constraints: teal brand (#00897B, #00796B for filled actions), Manrope + Inter, lucide-react icons, Recharts animated charts, sentence case, no emoji, WCAG 2.2 AA, every screen usable at 375px. Category sidebar with collapsible groups (owner request).

Unresolved: capacity/ranking formulas, overtime rates (manual, labelled).

## Direction contract

THESIS: The day is the dashboard. Home opens on a live run sheet of today's visits, one lane per community and hour columns, so lateness, no-shows and gaps are seen before anyone reports them. Refuses the KPI-card-row-plus-gradient-chart template.

OWN-WORLD: Five-star housekeeping run sheet rendered as software. Deep teal shell #0B3B36 with collapsible category groups; cool white ground #F5F8F7; white work surfaces on 1px #E3EAE7 rules, no decorative shadows; ink #0F172A, muted #5B6B68; teal #00796B only for action, selection and done work; amber late, red no-show/overdue, dashed outline unassigned; one gold #C9A227 "now" line, nowhere else. Manrope figures tabular, Inter UI 13–14px, compact rows.

STORY: An admin opens the portal, sees today's run and what needs them (queues as one line of facts with links), acts on alerts in place, and moves through any module from the grouped sidebar or ⌘K; every high-impact action asks once, clearly.

FIRST VIEWPORT: Left: 260px teal sidebar, groups collapsible, counts on items and on collapsed groups, scope and search at top, profile bottom. Top: page title + date + segmented Today/Tomorrow/Week + primary "Assign visits (n)". Then a single facts line (visits, late, no-shows, unassigned, verifications). Centre: run sheet card (lanes × hours, now line, legend, filters). Right 320px: alerts with inline actions. Below fold: Recharts visits and collections (flat lines/bars, animated draw, exact tooltips), queues table.

FORM: Concierge Run Sheet, position 2 on my safer-register list; seed: f4bf443c1ba86b7b. Signature interaction: the run sheet with true-duration visit blocks and the live now line, reused as lanes in Allocation and Attendance.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
