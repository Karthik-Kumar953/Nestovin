# NESTOVIN — Product Design System

**Document ID:** NV-DS-01  
**Version:** 1.1 — Product design foundation  
**Date:** 19 November 2026  
**Prepared by:** Nexif Technologies  
**Product:** Nestovin Home Services & Workforce Platform  
**Tagline:** A Home That Brings People Together  
**Status:** Design baseline for Stitch exploration and design review  
**Applies to:** Resident App · Employee App · Unified Admin Portal · Public Website

---

## 0. Document authority and usage

This document translates Nestovin's existing brand identity and current product requirements into a shared UI design system. It is intended for product design, Stitch, Claude Design, frontend engineering and visual QA.

### 0.1 Source-of-truth hierarchy

| Concern | Governing source | Treatment in this document |
|---|---|---|
| Logo, brand colours, type families and brand personality | Supplied Nestovin Brand Kit | Fixed; do not redesign |
| Product scope, operating modes, payment rules, roles and user permissions | Nestovin PRD v1.1, 19 November 2026 | Functional guardrails; do not reinterpret visually |
| Component dimensions, spacing, responsive behaviour, accessibility variants and interaction patterns | This design system | Product UI standards proposed by Nexif; validate during the first design pilot |
| Exact screen layouts and final navigation | Approved screen designs/prototypes | To be established progressively, beginning with the Resident App |

### 0.2 Decision labels

- **BRAND-LOCKED:** Directly follows the approved Nestovin Brand Kit.
- **PRD-LOCKED:** Must reflect the latest approved product requirement baseline.
- **DESIGN BASELINE:** Recommended default for consistent UI implementation; can be refined through design review without changing product behaviour.
- **OPEN:** Requires product-owner/client decision. Do not invent a value or policy.

### 0.3 What this document is not

This is not a final screen inventory, business-rule specification, component implementation library, technology-stack decision or replacement for the PRD/SOW. The product-specific rules below prevent the design agent from inventing behaviour while generating layouts.

---

# 1. Product design direction

## 1.1 Design intent

Nestovin should feel like a **premium, dependable residential services platform**: calm, human, modern, organised and easy to use. A resident should feel that they are interacting with a professionally managed home-services company and trusted community workforce—not browsing an open marketplace.

The product should achieve a premium impression through clarity, useful whitespace, readable typography, purposeful imagery, consistent components and predictable interactions. Avoid visual noise, decorative complexity and unnecessary motion.

## 1.2 Brand personality translated into UI

| Brand quality | UI expression |
|---|---|
| Trust | Transparent pricing, clear service coverage, visible request/payment status and reliable confirmations |
| Care | Supportive language, accessible forms, respectful worker presentation and recoverable error states |
| Freshness | Clean white and mint surfaces, natural photography and uncluttered layouts |
| Modernity | Consistent typography, disciplined component patterns, responsive layouts and restrained motion |
| Togetherness | Community-aware context, household clarity and human-centred service communication |

## 1.3 Core design principles

1. **Clarity before decoration.** Every screen must make its purpose and next action obvious.
2. **One dominant action.** Use one visually dominant primary action per screen or decision area. Secondary actions remain subordinate.
3. **Progressive disclosure.** Show essential information first; reveal detailed task coverage, plan conditions and secondary information when needed.
4. **Visible system status.** Users must understand whether an item is pending, paid, approved, scheduled, active, completed, failed or blocked.
5. **Recognition over recall.** Keep community, flat, selected service, plan, amount due and next step visible in context.
6. **Consistency over novelty.** Reuse the same typography, spacing, components, labels and state patterns across the four product surfaces.
7. **Error prevention.** Validate inputs, eligibility, price, availability and payment purpose before committing an action.
8. **Respectful simplicity.** Use plain language and minimise the amount of information users must process at once.
9. **Accessibility from the start.** Contrast, target size, focus, text scaling and screen-reader semantics are design requirements—not post-design polish.
10. **Operational truth over visual optimism.** Never show an unavailable slot, unverified payment, unapproved family member or unconfirmed service as complete.

---

# 2. Brand identity foundations

## 2.1 Logo usage — BRAND-LOCKED

Use only the approved assets and lockups supplied in the Nestovin Brand Kit:

- Primary horizontal logo: preferred when sufficient horizontal space is available.
- Stacked logo: compact or vertically constrained placements.
- Emblem only: app icon, favicon and compact brand marker where the wordmark is impractical.
- White/reversed logo: approved dark backgrounds.
- Black/monochrome logo: only where a single-colour treatment is required and allowed by the Brand Kit.

**Logo rules:** Preserve the approved geometry, proportions, alignment and colours. Do not stretch, rotate, redraw, recolour, outline, add effects or create alternative lockups. Maintain clear space equal to the emblem height around the mark. Follow the Brand Kit's stated minimum digital size of 80 px and print size of 20 mm where applicable.

## 2.2 Brand colour palette — BRAND-LOCKED

These values define Nestovin's visual identity and must not be changed by a design agent.

| Token | Hex | Role |
|---|---|---|
| Primary Teal | `#00897B` | Core brand colour and primary brand recognition |
| Primary Green | `#43A047` | Supporting brand colour for care, freshness and positive emphasis |
| Background Mint | `#F5FAF9` | Calm, clean background surface |
| Charcoal | `#111827` | Dark brand surface and strong contrast |

The Brand Kit's suggested 40/25/25/10 composition is a broad brand-application guide. It is **not** a requirement to fill 65% of each application screen with saturated teal and green. Application screens should primarily use white, mint and neutral surfaces.

## 2.3 Neutral palette — BRAND-LOCKED

| Token | Hex | Intended UI role |
|---|---|---|
| Neutral 900 | `#1F2937` | Main text and high-priority content |
| Neutral 700 | `#4B5563` | Supporting text, descriptions and metadata |
| Neutral 400 | `#9CA3AF` | Muted/decorative content only; avoid for essential small text |
| Neutral 200 | `#E5E7EB` | Borders, dividers and subtle boundaries |
| Neutral 100 | `#F1F5F9` | Secondary surfaces and subdued panels |
| White | `#FFFFFF` | Main cards and content surfaces |

## 2.4 Semantic colours — BRAND-LOCKED

| Meaning | Brand value | Intended meaning |
|---|---|---|
| Success | `#22C55E` | Completed or active state |
| Warning | `#F59E0B` | Pending or caution state |
| Error | `#EF4444` | Failure, validation error or destructive state |
| Information | `#3B82F6` | Information, guidance or update |
| Highlight | `#8B5CF6` | Special/premium emphasis only; use sparingly |

Semantic colours must not be decorative accents. Do not use colour alone to communicate a state; pair it with a label and/or icon.

## 2.5 Accessible action colours — DESIGN BASELINE

The approved brand colours remain unchanged. However, normal-sized white text on the brand teal and green does not meet the WCAG AA 4.5:1 text-contrast threshold. Use darker UI-only action variants when a filled control needs white text.

| UI token | Value | Default use |
|---|---|---|
| Teal Action | `#00796B` | Primary filled button and high-priority interactive control |
| Teal Deep | `#00695C` | Pressed/active state and high-contrast teal treatment |
| Green Action | `#2E7D32` | Green filled action when genuinely needed; do not compete with the primary teal action |
| Success Text | `#166534` | Success label/text on white or pale green surface |
| Warning Text | `#92400E` | Warning label/text on white or pale amber surface |
| Error Text | `#B91C1C` | Error label/text on white or pale red surface |
| Info Text | `#1D4ED8` | Information label/text on white or pale blue surface |

Suggested pale semantic surfaces: Success `#DCFCE7`, Warning `#FEF3C7`, Error `#FEE2E2`, Information `#DBEAFE`.

Approximate contrast against white: Teal Action 5.32:1, Teal Deep 6.61:1, Green Action 5.13:1. Recheck the exact foreground/background pair in the rendered design and in implementation. Do not assume a colour passes on every surface.

---

# 3. Typography system

## 3.1 Typeface roles — BRAND-LOCKED

| Typeface | Primary role | Use |
|---|---|---|
| Manrope | Display and headings | Screen titles, section headings, important brand statements and hero headings |
| Inter | Body and interface | Body copy, form labels, inputs, tables, buttons, metadata and dense UI |

Do not substitute font families without approval. Preferred weights are 400, 500, 600 and 700. Use 300 or 800 only when a screen has a clear, reviewed reason.

## 3.2 Reference type scale

The desktop hierarchy below follows the supplied Brand Kit.

| Style | Typeface | Weight | Size / line height | Usage |
|---|---|---:|---:|---|
| H1 | Manrope | 700 | 56 / 64 px | Desktop page hero or major page heading |
| H2 | Manrope | 600 | 40 / 48 px | Major section heading |
| H3 | Manrope | 600 | 28 / 36 px | Subsection heading |
| H4 | Manrope | 500 | 24 / 32 px | Card/section heading |
| H5 | Inter | 500 | 20 / 28 px | Compact content heading |
| Body | Inter | 400 | 16 / 24 px | Main body content |
| Small | Inter | 400 | 14 / 20 px | Supporting text and form help |
| Caption | Inter | 400 | 12 / 16 px | Secondary metadata only |

## 3.3 Mobile type adaptation — DESIGN BASELINE

Do not force the desktop H1 size onto mobile screens. Preserve the same families and hierarchy while reducing sizes deliberately.

| Mobile role | Recommended size / line height | Usage |
|---|---:|---|
| Screen title | 28–32 / 36–40 px | Main app screen heading |
| Section title | 22–24 / 28–32 px | Content section heading |
| Card/row title | 16–18 / 24 px | Service, plan and list title |
| Body | 14–16 / 20–24 px | Main descriptive content |
| Helper text | 12–14 / 16–20 px | Short form guidance and metadata |

Do not use 12 px text for payment amounts, deadlines, service terms, legal information or instructions that affect a user's decision.

## 3.4 Typography behaviour

- Use sentence case for most UI labels and buttons.
- Use tabular numerals for prices, balances, dates, time, durations and operational counts where available.
- Keep line lengths comfortable; avoid long paragraphs inside mobile cards.
- Use weight and size to establish hierarchy, not excessive colour changes.
- Keep currency and decimal formatting consistent throughout the product.
- Do not truncate important payment values, service dates or status labels.

---

# 4. Layout and spacing system

## 4.1 Spacing scale — DESIGN BASELINE

Use a 4 px base rhythm. Select spacing from this scale before introducing one-off values.

| Token | Value | Typical use |
|---|---:|---|
| 2XS | 4 px | Icon/text micro-gap and tight alignment |
| XS | 8 px | Label/helper spacing and compact groups |
| SM | 12 px | Related compact elements |
| MD | 16 px | Standard field spacing and compact component padding |
| LG | 24 px | Standard card padding and section separation |
| XL | 32 px | Major section separation |
| 2XL | 48 px | Large section separation |
| 3XL | 64 px | Desktop hero and large page spacing |

## 4.2 Mobile layout

- Start from a 390 px reference frame; verify at 360 px and a wider phone width.
- Use 20 px horizontal content margin as the starting point.
- Respect device safe areas, system bars, keyboard insets and scroll behaviour.
- Keep primary actions reachable and avoid covering content with sticky controls.
- Reflow and progressively disclose content rather than shrinking type or touch targets.
- Avoid multi-level modal/bottom-sheet sequences. Use a full screen when a task requires multiple meaningful steps.

## 4.3 Tablet and web layout

| Range | Layout intent |
|---|---|
| 0–767 px | Mobile and compact interface |
| 768–1023 px | Tablet/intermediate layout |
| 1024 px and above | Desktop/expanded layout |

These are starting breakpoints; content should determine when a layout needs to change.

**Public Website:** use a restrained max-width content system, generous margins, editorial hierarchy and clear responsive sections.

**Admin Portal:** use one persistent sidebar/navigation rail, consistent page title/action area, filters close to result sets and readable tables. A dense operational interface is acceptable; an overcrowded dashboard is not.

## 4.4 Grid recommendations

- Mobile: use a simple 4-column grid with consistent outer margins and gutters.
- Tablet: use an 8-column grid where it improves grouping and alignment.
- Desktop: use a 12-column grid with consistent gutters and a stable content container.
- Do not force every component to align to a card grid; use lists and tables for repetitive data.

The grid is a layout aid, not a reason to place every datum inside a card.

---

# 5. Elevation and depth

Nestovin should look calm and credible, not like a stack of floating cards.

| Level | Use | Treatment |
|---|---|---|
| 0 | Default surfaces | No shadow; use whitespace, background contrast and dividers |
| 1 | Standard raised content | Very soft shadow or subtle neutral border |
| 2 | Floating menu/control | Slightly stronger separation from underlying content |
| 3 | Modal/dialog | Strongest elevation; use only for focused decisions |

Prefer spacing and tonal layers before shadows. Avoid heavy shadows on every card, glassmorphism, coloured glows, neon effects, strong blur and nested cards without a clear information hierarchy. Exact shadow values are to be selected in the first screen-design pilot and then kept consistent.

---

# 6. Shape language

## 6.1 Corner radius scale — DESIGN BASELINE

| Token | Value | Use |
|---|---:|---|
| Small | 8 px | Inputs, compact chips and small controls |
| Medium | 12 px | Buttons and compact cards |
| Large | 16 px | Main cards, sheets and content panels |
| X-Large | 24 px | Large mobile surfaces or hero containers; use sparingly |
| Full | 9999 px | Pills, status chips and circular avatars |

Use the same radius for the same component type. Avoid combining sharp rectangular controls with excessively rounded cards on one screen.

## 6.2 Brand geometry

The approved Nestovin geometric emblem and house/community patterns may be used sparingly in onboarding, brand and marketing surfaces. Do not place decorative brand patterns behind dense transactional content, forms, tables or payment details.

---

# 7. Component foundation

This section defines the shared component behaviour expected across the product. Product surfaces may adapt component density and layout, but not their core visual semantics.

## 7.1 Buttons

| Variant | Treatment | Use |
|---|---|---|
| Primary | Teal Action fill, white label | Single most important action in the current context |
| Secondary | White/mint surface, Teal Action border and label | Alternative action |
| Tertiary | Text-led, no filled container | Low-priority navigation or inline action |
| Destructive | Error Text/fill with explicit wording | Delete, revoke or other destructive decision |

**Baseline sizing:** mobile primary action height at least 48 dp; use 48 px as the starting design value. Use 16 px horizontal padding as a starting point. Button text uses Inter 14–16 px, weight 500–600.

Every button needs default, pressed, disabled, loading and focus-visible states. Prevent duplicate submissions while a request is processing. Use precise verbs: “Continue”, “Submit request”, “Pay balance”, “Confirm” or “Retry payment”. Avoid context-free labels such as “OK” when the action has a consequence.

Do not place two equally prominent filled primary actions side by side. If a screen has a primary and a destructive choice, make the primary action visually dominant but make the destructive consequence explicit.

## 7.2 Inputs and forms

- Use a persistent visible label; placeholders are examples, not labels.
- Starting input height: 52 px. Use 8 px radius and 16 px internal horizontal padding.
- Keep helper text adjacent to its field.
- Clearly distinguish required and optional fields.
- Use appropriate keyboard/input modes for phone, OTP, email, date and numeric fields.
- Validate on blur or submit when appropriate; do not interrupt users on every keystroke.
- Put actionable error text next to the relevant field.
- Preserve entered values after recoverable validation or network errors.
- Do not clear form content after a failed payment or network interruption.
- Use grouped fields and step-by-step forms for long onboarding tasks.

## 7.3 Cards and list rows

Cards must group meaningful related information, not decorate empty space. A card should have a clear title, short supporting content where useful and no more than one dominant action. Use 16–24 px padding according to density and viewport. Avoid nested card stacks.

Use structured lists/tables for repeated operational records. Keep row height, labels, metadata and trailing actions predictable.

## 7.4 Status indicators

Use a consistent status label plus colour and, where useful, an icon. Never rely on colour alone. Status chips should use pale semantic surfaces and readable semantic text.

Candidate UI labels include:

- Pending verification
- Demand cycle open
- Commitment payment pending
- Commitment received
- Awaiting service date
- Balance payment due
- Payment complete
- Booking confirmed
- Assignment pending
- Service scheduled
- Service in progress
- Service completed
- Request expired

These are presentation examples, not the definitive backend state vocabulary. Bind text to the actual state returned by the product workflow. Do not show a success state before backend confirmation.

## 7.5 Navigation patterns

These are starting patterns for the pilot, not immutable information architecture.

**Resident App — proposed bottom navigation:**
- Home
- Services
- Activity
- Support
- Profile

Keep selected community/flat context accessible without taking over the entire navigation area. Put time-sensitive actions in the relevant screen, not in an unrelated tab.

**Employee App — proposed navigation:**
- Today / Schedule
- Training
- Availability / Leave
- Profile

Today's assignment, attendance and service completion actions should be directly accessible from the Today/Schedule experience. Do not bury work actions in Profile.

**Unified Admin Portal:**
- One web application and one shared navigation structure.
- Navigation items are filtered by Super Admin-assigned module permissions.
- Action permission and data scope are enforced separately by the backend.
- A role/category label does not automatically grant a fixed module set.
- Cluster-scoped users must only see data in assigned cluster scope.

**Public Website:**
- Clear header navigation for Home, Services, How It Works, About, FAQ and Contact.
- Privacy, Terms and Careers Information are accessible without overcrowding the main navigation.
- The V1 website is informational and enquiry-led; do not introduce online booking.

## 7.6 Selection controls, filters and sheets

Use radio controls for mutually exclusive choices, checkboxes for independent selections and chips only for concise filter/selection states. Do not use chips as a substitute for clearly labelled form controls. Use a bottom sheet for a focused secondary selection; use a full screen for multi-step or high-consequence tasks.

## 7.7 Dialogs, banners and toasts

- Use a dialog for focused confirmation of high-impact or destructive actions.
- Name the consequence in the dialog title/body and use explicit action labels.
- Use inline banners for important persistent information, such as a payment deadline or verification hold.
- Use toast/snackbar feedback for brief non-critical confirmation only.
- Important payment and service states must also appear in the corresponding record view.
- A notification being sent does not mean that a payment, booking or service state changed.

## 7.8 Loading, empty, error and restricted states

Design the relevant states for every core data-driven screen:

- Initial loading/skeleton where appropriate.
- Empty/no records yet.
- No results after filters/search.
- Network unavailable and retry.
- Permission restricted.
- Data unavailable or stale.
- Validation failure.
- Payment pending, failed or needs verification.
- Successful completion.

Avoid generic “Something went wrong” copy when a specific explanation and next step can be provided. Do not fabricate zero counts when a data request fails.

---

# 8. Iconography and imagery

## 8.1 Iconography

Use one consistent, clean line-icon family. The Brand Kit's service icon direction for Maid, Cook and Caretaker and its home/community icon style should guide the icon language.

**Proposed implementation defaults:** 24 px standard icon box, 20 px compact icon box, consistent 1.75–2 px stroke, rounded or consistent joins, and optical alignment with adjacent text. Treat these as UI recommendations, not measured Brand Kit specifications.

- Use the same icon family across a product surface.
- Pair unfamiliar icons with text labels.
- Use filled variants only for selected/active states when the icon family supports them consistently.
- Do not mix outline, filled, 3D, emoji and hand-drawn icon styles on one screen.
- Do not invent icons that suggest services outside Maid, Cook and Caretaker.
- Decorative icons should not be exposed as meaningful screen-reader content.

## 8.2 Photography and illustration

- Prefer warm natural daylight, real residential settings and believable community environments.
- Represent workers professionally and respectfully; avoid stereotyped or patronising imagery.
- Use images when they establish trust or explain a service, not merely to fill space.
- Keep crop ratios, corner treatments and overlays consistent.
- Avoid generic luxury-home imagery that does not reflect the actual operating context.
- Do not rely on photography alone to communicate a service or important instruction.
- Use illustrations sparingly and follow the approved brand geometry.

## 8.3 Motion

Motion should confirm state, communicate hierarchy or guide attention—not decorate the interface.

**Proposed timing:** 120–200 ms for small control feedback; 180–250 ms for simple panel/screen transitions. Use restrained easing and respect reduced-motion settings. Do not delay a critical payment or booking interaction for decorative animation. Avoid parallax, constant motion, excessive bounce and animated gradients.

---

# 9. Accessibility and usability baseline

## 9.1 Conformance target

Target **WCAG 2.2 Level AA** for web and mobile digital interfaces. This is a product quality target. It does not mean that every approved Brand Kit colour pairing automatically passes.

## 9.2 Contrast

- Normal text: at least 4.5:1.
- Large text: at least 3:1.
- Meaningful non-text UI boundaries and graphical objects: at least 3:1 where required by WCAG.
- Check actual foreground/background combinations, including hover, pressed, selected, disabled and error states.
- Avoid Neutral 400 `#9CA3AF` for important text on white/mint surfaces.
- Do not use the brand teal or brand green as white-text fills for normal text unless the exact contrast passes; use approved UI action variants instead.

## 9.3 Touch, keyboard and focus

- Use 48 × 48 dp as the mobile touch-target design baseline.
- Ensure adequate separation between adjacent controls.
- Provide visible keyboard focus on web interfaces.
- Do not make important actions or information hover-only.
- Ensure modal/dialog focus is managed and returned sensibly when closed.
- Avoid keyboard obstruction of the active field or primary action.

## 9.4 Content and assistive technology

- Use meaningful accessible names for controls and actionable icons.
- Hide purely decorative graphics from assistive technology.
- Use logical heading order and labelled form controls.
- Announce important state changes such as request submission and payment success/failure.
- Do not place essential text inside images.
- Support text resizing without clipping content or hiding actions.
- Use plain language; explain unfamiliar operational terms.

## 9.5 Usability heuristics applied to Nestovin

| Principle | Application |
|---|---|
| Jakob's Law | Use familiar mobile navigation, service cards, form patterns, booking summaries and payment conventions |
| Hick's Law | Present only the three approved V1 service categories as the main service choices; reveal details progressively |
| Progressive disclosure | Show essentials first; expand task coverage, plan terms and exception details when relevant |
| Recognition over recall | Keep community, flat, selected plan, payment amounts and next step visible in context |
| Visibility of system status | Distinguish request, payment, booking, subscription, assignment and service states |
| Error prevention | Validate residence, eligibility, plan, price, availability and payment context before commitment |
| User control and freedom | Provide safe review/back paths before payment and explain deadline-bound actions |
| Match to the real world | Use familiar terms such as Community, Flat, Maid, Cook, Caretaker and Service Date |
| Consistency and standards | Reuse the same components, labels, status semantics and interaction rules |

---

# 10. Product-specific visual and interaction guardrails

## 10.1 Resident App

- Design only for Maid, Cook and Caretaker in V1.
- Show services and plans only when enabled for the resident's verified community/residence context.
- V1 uses one active residence context per resident account; a residence change follows a controlled request/review path.
- The first successfully verified resident linked to a flat is the Primary Resident. Family-member access remains pending until authorised approval.
- Make the difference between demand-led and continuous operation clear before the resident commits.
- Demand-led payment percentage is configured by Super Admin per demand cycle, then locked when the cycle is published. The UI must display the actual configured initial percentage/amount and the calculated outstanding balance from the backend. Do not hard-code 30%/70%.
- Existing demand/booking financial terms must be presented from their stored configuration snapshot; future cycle configuration must not silently change them.
- Continuous-mode booking requires 100% payment and capacity validation before confirmation.
- Show only Admin-published slots backed by feasible workforce capacity. Do not promise 24×7 availability in V1.
- Do not imply instant service in a demand-led context.
- Do not expose employee HR documents, payroll data, private contact information or internal allocation scores.

## 10.2 Employee App

- Make today's assignment and next required action immediately visible.
- Routine assignments do not require employee accept/reject.
- Optional additional-work/overtime offers do require employee accept/reject, followed by Admin confirmation.
- Attendance uses OTP or QR as configured. Location evidence is event-based at attendance verification; do not design continuous/background employee tracking.
- Keep training simple and video-based; do not design a full LMS.
- Keep wording task-oriented, readable and respectful. Do not assume literacy level, language preference or device capability without confirmation.
- Show only resident information needed for the assigned service.

## 10.3 Unified Admin Portal

- Design one unified web portal—not separate HR, Operations, Support and Payroll applications.
- Super Admin creates Admin users and configures per-user module access; optional action-level restrictions may be applied.
- Account category labels do not automatically imply fixed access.
- Keep module permission separate from data scope. A Cluster Admin is restricted to assigned cluster(s).
- Every protected route/action must respect backend permissions; hiding navigation alone is not sufficient.
- Prioritise search, filters, status, next action and audit context.
- Use readable tables for repetitive operational information; avoid a card for every metric.
- Do not include placeholder screens for deferred modules.

## 10.4 Public Website

- Informational and enquiry-led only.
- Explain only Maid, Cook and Caretaker.
- Include approved Home, Services, How It Works, About, Contact/Enquiry, FAQ, Privacy, Terms and Careers Information content.
- Route enquiries to the approved Support destination.
- Do not add online service booking, a general-purpose CMS, career applications or a CRM in V1.

---

# 11. Stitch and design-agent workflow

## 11.1 Project organisation

Create four separate design projects, all using the same approved design-system reference:

1. `Nestovin — Resident App`
2. `Nestovin — Employee App`
3. `Nestovin — Unified Admin Portal`
4. `Nestovin — Public Website`

Keep mobile screens and desktop Admin screens in separate projects to avoid mixing frame sizes, navigation models and interaction assumptions. Import the portable `DESIGN.md` into each project where supported. Add the approved logo assets and relevant Brand Kit pages as visual references.

## 11.2 Resident App pilot sequence

Before generating the full application, create and review a small representative pilot:

1. **Resident Home:** approved residence context, service entry points and active/pending service status.
2. **Service and Plan Selection:** enabled service, configured plan, task coverage, frequency/duration and community-specific price.
3. **Demand/Payment Status:** configured cycle payment percentage, initial paid amount, remaining balance, current request state and next step.

After the pilot is reviewed, refine reusable components and patterns before expanding the full Resident App screen set.

## 11.3 Prompt-writing standard

Each design prompt should state:

- Product context and target user.
- User's current state in the approved workflow.
- Screen purpose and single primary action.
- Required information, fields and data labels.
- Relevant previous and next screen context.
- Error, loading, empty, restricted and success states required.
- Device/frame target and responsive requirements.
- Accessibility constraints.
- Product rules and explicit exclusions.

Once the project design system is applied, screen prompts should focus on layout, content, user intent and state. Do not repeat or override the brand colours and fonts in every prompt unless a specific reviewed exception is required.

## 11.4 Mandatory prompt guardrails

Append these constraints to screen-generation prompts:

> Follow the approved Nestovin design system and current PRD. Do not invent services, plan names, prices, entitlements, dates, policies or capabilities. The only V1 services are Maid, Cook and Caretaker. Keep demand-led and continuous booking visually and functionally distinct. Read demand-led payment values from the configured cycle/booking data; never assume a fixed 30%/70% split. Do not show a demand request as a confirmed booking or service. Do not add website booking, open-marketplace provider browsing, live employee tracking, deferred Admin modules or unapproved features. Design realistic loading, empty, error, pending, disabled and success states.

## 11.5 Review loop

For each generated screen:

1. Check workflow fidelity and data correctness.
2. Check that the purpose and primary action are immediately clear.
3. Check typography, spacing, colours, icon consistency and responsive fit.
4. Check contrast, touch targets, text scaling and keyboard/focus behaviour where relevant.
5. Check loading, empty, error, pending and success states.
6. Connect the screen to the next/previous screen in a clickable prototype.
7. Record accepted patterns before expanding the screen set.

---

# 12. Design quality gates

A screen is ready for design review only when all applicable items pass.

## Brand and visual consistency
- [ ] Approved logo variant, proportions and clear space are correct.
- [ ] Fixed brand colours are unchanged.
- [ ] Accessible UI action variants are used for text-bearing filled controls where needed.
- [ ] Manrope and Inter are used in their defined roles.
- [ ] Icon family, imagery and corner treatments are consistent.
- [ ] Spacing and alignment follow the shared scale.

## UX and functional accuracy
- [ ] Screen matches the current PRD and approved user flow.
- [ ] Only approved V1 service categories are present.
- [ ] Demand request, payment, booking, subscription and service status are not conflated.
- [ ] Demand-cycle percentage is dynamic and comes from the configured cycle snapshot.
- [ ] Continuous-mode booking displays full-payment requirements and availability accurately.
- [ ] No unapproved plan, price, entitlement, service or policy is introduced.

## Accessibility
- [ ] Foreground/background contrast has been checked.
- [ ] Colour is not the only status signal.
- [ ] Touch targets and spacing are adequate.
- [ ] Labels, focus and error messages are clear.
- [ ] Layout supports text scaling and responsive widths.
- [ ] Interactive components have accessible names and states.

## State completeness
- [ ] Default state is designed.
- [ ] Loading state is designed where needed.
- [ ] Empty/no-results state is designed where relevant.
- [ ] Validation and network-error states are designed.
- [ ] Disabled/restricted state is designed.
- [ ] Pending/payment-in-progress states are designed where relevant.
- [ ] Success/confirmation state is designed.

---

# 13. Fixed decisions, design proposals and open items

## 13.1 Fixed from the Brand Kit

- Primary Teal `#00897B`.
- Primary Green `#43A047`.
- Background Mint `#F5FAF9`.
- Charcoal `#111827`.
- Brand neutral and semantic palette documented in Section 2.
- Manrope and Inter type families.
- Approved logo variants and use rules.
- Warm, natural imagery and consistent minimal icon direction.

## 13.2 Fixed from the current PRD

- V1 services: Maid, Cook and Caretaker only.
- Company-operated workforce model; not an open marketplace.
- Resident does not choose a named employee.
- Demand-led initial payment percentage is configured by Super Admin per cycle and locked when the cycle is published.
- Continuous mode requires 100% payment before booking confirmation/service activation.
- Only Admin-published slots backed by feasible workforce capacity are offered in V1.
- Attendance uses OTP or QR with event-based location evidence; continuous live tracking is excluded.
- Standard employee assignment does not require employee acceptance; optional additional-work/overtime offers do.
- One unified Admin Portal with per-user module/action permission and separate data-scope enforcement.
- Public Website is informational and enquiry-led; no online booking.

## 13.3 Product UI proposals requiring visual review

- Accessible dark action variants for teal and green.
- Spacing scale, component dimensions, corner radii and elevation hierarchy.
- Responsive reference frames and breakpoints.
- Resident and Employee navigation starting models.
- Component-specific states, icon sizing and motion timings.
- WCAG 2.2 AA as the design/engineering target.

## 13.4 Open or not determined by this document

- Final Resident App tab structure and screen inventory.
- Final employee navigation labels and language/localisation.
- Exact photography and illustration asset library.
- Exact shadow values and any platform-specific component adaptations.
- Final web/Admin density and responsive sidebar behaviour after usability review.
- Final typography adjustments after real-device testing.
- Technology stack and implementation framework.

Do not treat a visual proposal as approval to change product scope or business rules.

---

# 14. Source references

1. **Nestovin Brand Kit, version 1.0:** logo system and use rules (page 2); primary, neutral and semantic palette (page 3); Manrope/Inter typography and component examples (page 4); brand application, backgrounds, pattern and icon guidance (page 5).
2. **Nestovin PRD v1.1 — Engineering Baseline, dated 19 November 2026:** current product scope, V1 services, operating modes, configurable demand-led payment percentage, access boundaries, accessibility and screen guardrails.
3. **Nestovin Design System v1.0, NV-DS-01:** prior product UI foundation; refined here to align with the latest PRD v1.1.
4. **Google Labs, Stitch DESIGN.md format:** open format combining YAML design tokens with human-readable Markdown guidance. The published specification is currently marked alpha; validate with the current toolchain when importing.
   - https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-design-md/
   - https://stitch.withgoogle.com/docs/design-md/specification
   - https://github.com/google-labs-code/design.md/blob/main/docs/spec.md
5. **W3C WCAG 2.2:** https://www.w3.org/TR/WCAG22/

---

**End of document — NV-DS-01, Version 1.1.**
