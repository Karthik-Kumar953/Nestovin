# NESTOVIN — Brand & Product UI Design System

**Document ID:** NV-DS-01  
**Version:** 1.0 — Design foundation draft  
**Prepared by:** Nexif Technologies  
**Product:** Nestovin  
**Date:** 5 November 2026  
**Purpose:** Shared visual and interaction foundation for the Resident App, Employee App, Unified Admin Portal and Public Website  
**Status:** Brand values are transcribed from the supplied Nestovin Brand Kit; product UI extensions are Nexif recommendations for design review.

---

## 1. Design direction

### 1.1 Product design intent

Nestovin should feel like a **premium, dependable residential service brand**: calm, human, modern, organised and easy to use. The interface should communicate that residents are engaging with a managed home-services company and a trusted community workforce—not browsing an open marketplace.

The UI should feel warm and approachable without becoming playful, decorative or visually noisy. Its quality should come from strong hierarchy, excellent spacing, consistent components, purposeful imagery, readable content and predictable interaction patterns.

### 1.2 Brand personality

The supplied Brand Kit describes the brand through trust, care, freshness, modernity and togetherness. The product UI should express these traits as follows:

| Brand trait | Interface expression |
|---|---|
| Trust | Clear service details, transparent prices, visible request/payment status, consistent confirmations and restrained visual treatment |
| Care | Human language, supportive error states, accessible controls and respectful resident/employee experiences |
| Freshness | Mint surfaces, clean layouts, natural photography and uncluttered content |
| Modernity | Consistent typography, clear component states, responsive layouts and purposeful motion |
| Togetherness | Community-aware context, household clarity and human workforce presentation |

### 1.3 Design principles

1. **Clarity before decoration.** The purpose and next action of every screen must be apparent without explanation.
2. **One dominant action.** Keep one primary CTA per screen or decision area; secondary actions must be visually subordinate.
3. **Progressive disclosure.** Present essential information first. Reveal detailed task coverage, terms, exceptions and supporting information when relevant.
4. **Visible system status.** Residents and employees must understand whether a request is pending, paid, approved, scheduled, active, completed or blocked.
5. **Predictable patterns.** Reuse the same field behaviour, button hierarchy, navigation, confirmation and error language throughout the product.
6. **Low cognitive load.** Avoid unnecessary options, duplicate information, overloaded cards, decorative data visualisations and unexplained jargon.
7. **Accessibility is part of the design.** Contrast, target size, keyboard/focus behaviour, text scaling and screen-reader semantics are not final-stage polish.

---

## 2. Brand identity — fixed values from the supplied Brand Kit

The supplied Nestovin Brand Kit is the source of truth for logo use, brand colour identity, type families and brand imagery. This document does not redesign the identity.

### 2.1 Logo system

Use only the supplied approved logo assets and lockups:

- **Primary horizontal logo:** preferred brand signature where sufficient width is available.
- **Stacked logo:** use in compact or vertically constrained placements.
- **Emblem only:** use for app icon, favicon or compact brand markers where the full wordmark is impractical.
- **White/reversed logo:** use on approved dark backgrounds.
- **Black/monochrome logo:** use only where a single-colour treatment is required and permitted by the Brand Kit.

**Logo controls:** preserve the original proportions, alignment and colour. Do not stretch, rotate, tilt, redraw, add outlines, add shadows/effects, alter the arrangement or invent a new mark. Keep clear space around the logo equal to the height of the emblem on all sides. The Brand Kit specifies a minimum digital size of 80 px and print size of 20 mm.

### 2.2 Primary colour palette

These four values are fixed brand colours from the Brand Kit.

| Token | Hex | RGB | Approved role |
|---|---|---:|---|
| Primary Teal | `#00897B` | 0, 137, 123 | Main brand colour; brand recognition and primary visual identity |
| Primary Green | `#43A047` | 67, 160, 71 | Supporting brand colour; care, freshness, growth and positive emphasis |
| Background Mint | `#F5FAF9` | 245, 250, 249 | Calm, clean background and soft surface treatment |
| Charcoal | `#111827` | 17, 24, 39 | Strong text, dark sections and professional contrast |

### 2.3 Neutral palette

These are also defined in the supplied Brand Kit and should be used as the common interface neutrals.

| Token | Hex | Brand Kit role | Recommended UI use |
|---|---|---|---|
| Neutral 900 | `#1F2937` | Primary text | Default body text and high-priority content |
| Neutral 700 | `#4B5563` | Secondary text | Supporting text, descriptions and metadata |
| Neutral 400 | `#9CA3AF` | Muted text | Disabled labels and non-critical decorative icons only; not normal body text on white |
| Neutral 200 | `#E5E7EB` | Borders/dividers | Input borders, dividers and subtle boundaries |
| Neutral 100 | `#F1F5F9` | Surfaces | Secondary surface, field backgrounds and subdued panels |
| White | `#FFFFFF` | Cards/content | Main card and content surface |

### 2.4 Semantic colours

The Brand Kit defines the following functional colours. Preserve their meanings; do not use them as decorative accents.

| Token | Hex | Meaning | Usage guidance |
|---|---|---|---|
| Success | `#22C55E` | Completed, active | Status indicators, success icons and restrained success accents |
| Warning | `#F59E0B` | Caution, pending | Pending state indicators and warnings |
| Error | `#EF4444` | Alert, destructive | Errors, destructive actions and failed states |
| Information | `#3B82F6` | Info, links, updates | Informational notices and neutral guidance |
| Highlight | `#8B5CF6` | Special, premium | Use sparingly for a genuinely special emphasis; not for ordinary status |

### 2.5 Brand colour usage

The Brand Kit suggests this overall composition: 40% Primary Teal, 25% Primary Green, 25% Background Mint and 10% Charcoal. Treat this as a brand composition guide, not a requirement to fill 65% of every app screen with saturated colour.

For application interfaces, use the colours by semantic role:

- Use white and mint for most page backgrounds and content surfaces.
- Use teal for the primary brand signal and key action areas.
- Use green as a supporting colour, not a second competing primary CTA on every screen.
- Use charcoal and neutral 900/700 for readable text.
- Use semantic colours only to communicate state or meaning.
- Do not use colour alone to communicate success, warning, error or selection; combine colour with labels, icons or other visible cues.

### 2.6 Accessibility-safe action colours — proposed UI extension

The brand colours remain unchanged. However, contrast calculations show that Primary Teal `#00897B` against white is approximately **4.32:1**, and Primary Green `#43A047` against white is approximately **3.30:1**. Both are below the WCAG AA 4.5:1 threshold for normal-size text. Do not put small white text on those brand fills and assume it passes.

To preserve brand identity while improving text contrast, use the following **proposed interface-only action variants**. These do not replace or redefine the brand palette.

| UI token | Proposed value | Intended use |
|---|---|---|
| Teal Action | `#00796B` | Primary filled button and key interactive fills with white text; approx. 5.32:1 with white |
| Teal Deep | `#00695C` | Stronger pressed/active or high-contrast teal text treatment; approx. 6.61:1 with white |
| Green Action | `#2E7D32` | Green filled action only when appropriate; approx. 5.13:1 with white |
| Success Text | `#166534` | Success text on white/mint or pale green surfaces; approx. 7.13:1 with white |
| Warning Text | `#92400E` | Warning text on white or pale amber surfaces; approx. 7.09:1 with white |
| Error Text | `#B91C1C` | Error text on white or pale red surfaces; approx. 6.47:1 with white |
| Info Text | `#1D4ED8` | Informational text on white or pale blue surfaces; approx. 6.70:1 with white |

The exact contrast values depend on the rendered colour pair and text size. Recheck actual component pairings during implementation and before release.

---

## 3. Typography system

The Brand Kit fixes **Manrope** as the primary typeface for headings/display and **Inter** as the secondary typeface for body/interface text. Do not substitute a new font family without brand approval.

### 3.1 Typeface roles

| Typeface | Role | Guidance |
|---|---|---|
| Manrope | Headings, display, key brand statements | Use to create strong but approachable hierarchy; avoid overusing heavy weights |
| Inter | Body copy, forms, tables, labels, metadata and dense UI | Use for clarity and legibility across mobile and web interfaces |

### 3.2 Brand Kit typography hierarchy

The following scale transcribes the hierarchy shown in the supplied Brand Kit.

| Style | Typeface | Weight | Size / line height |
|---|---|---:|---:|
| H1 | Manrope | Bold 700 | 56 / 64 px |
| H2 | Manrope | SemiBold 600 | 40 / 48 px |
| H3 | Manrope | SemiBold 600 | 28 / 36 px |
| H4 | Manrope | Medium 500 | 24 / 32 px |
| H5 | Inter | Medium 500 | 20 / 28 px |
| Body | Inter | Regular 400 | 16 / 24 px |
| Small | Inter | Regular 400 | 14 / 20 px |
| Caption | Inter | Regular 400 | 12 / 16 px |

The Brand Kit shows selected weights 300, 400, 500, 600, 700 and 800 for both type families. In production screens, prefer 400, 500, 600 and 700. Use 300/800 only where a design has a clear reason.

### 3.3 Responsive adaptation — proposed UI rule

The Brand Kit hierarchy is the source scale, but a 56 px H1 should not be forced into every mobile screen. Use responsive reductions while preserving font family, weight and hierarchy. Recommended mobile title ranges:

| Mobile role | Recommended size / line height | Use |
|---|---:|---|
| Screen title | 28–32 / 36–40 px | Resident/Employee page titles |
| Section title | 22–24 / 28–32 px | Content section heading |
| Card/row title | 16–18 / 24 px | Service names, plan titles, list titles |
| Body | 14–16 / 20–24 px | Main descriptive content |
| Helper text | 12–14 / 16–20 px | Form help, metadata, captions |

Avoid using 12 px text for important instructions, payment information or service terms. If content is important, it must remain comfortably readable when text is enlarged.

### 3.4 Typography behaviour

- Use sentence case for most UI headings and actions.
- Use numeric tabular alignment for prices, payment amounts, dates, durations, employee IDs and operational counts where available.
- Use consistent date, time and currency formats throughout the product.
- Avoid all-caps body copy. Small uppercase section labels may be used sparingly in dashboards or marketing layouts.
- Do not use long paragraphs in mobile cards. Use a short title, a concise explanation and a clear action.
- Never use font weight alone to communicate a state; pair it with a label or icon where required.

---

## 4. Layout and spacing system

The Brand Kit establishes a clean, readable and open visual approach. The numeric spacing scale below is a **proposed product UI system** to make that approach consistent across apps and web surfaces.

### 4.1 Spacing scale

Use a 4 px base rhythm with most spacing selected from the following scale.

| Token | Value | Typical use |
|---|---:|---|
| 2XS | 4 px | Icon/text micro gap, tight internal alignment |
| XS | 8 px | Label/helper spacing, compact control group |
| SM | 12 px | Related elements in a compact group |
| MD | 16 px | Standard component padding and field spacing |
| LG | 24 px | Card padding and section separation |
| XL | 32 px | Major section separation |
| 2XL | 48 px | Large section separation and page breathing room |
| 3XL | 64 px | Desktop section spacing and hero composition |

### 4.2 Mobile layout guidance

- Design mobile screens from a 390 px wide reference frame, then verify the layout at 360 px and a wider phone width.
- Respect device safe areas, system bars and keyboard insets.
- Use a consistent horizontal content margin; start at 20 px and adjust only when the content requires it.
- Keep the main CTA reachable and visible without covering important content.
- Use bottom sheets for focused secondary choices only when they do not obscure essential context or create a multi-step modal maze.
- Do not shrink text or controls to force a dense screen to fit. Reflow or progressively disclose content instead.

### 4.3 Web layout guidance

- Public Website: use a clear max-width content system, generous horizontal margins and a strong editorial hierarchy.
- Admin Portal: use a persistent navigation rail/sidebar, clear page title/actions, filters above results and readable data tables. Avoid a card for every data point.
- Keep a consistent page grid and alignment across Admin modules. Density is appropriate for operational data, but spacing and typography must remain legible.
- Tablet layouts must reflow rather than simply compress the desktop design.

### 4.4 Responsive breakpoints — proposed defaults

| Range | Layout intent |
|---|---|
| 0–767 px | Mobile / compact layout |
| 768–1023 px | Tablet / intermediate layout |
| 1024 px and above | Desktop / expanded layout |

Treat breakpoints as starting values, not hard constraints. Content behaviour should determine when a layout changes.

---

## 5. Elevation and depth

Use depth sparingly. Nestovin should look calm, clean and credible, not like a collection of floating cards.

- Prefer surface contrast, whitespace and thin neutral borders before adding shadows.
- Use an unobtrusive shadow only when an element genuinely needs to separate from the page (e.g. a floating bottom action or an anchored menu).
- Avoid heavy shadows on every card, coloured glows, neon effects and excessive glassmorphism.
- Avoid nested cards inside cards unless the hierarchy genuinely requires it.
- Use dividers and spacing to group content before adding more containers.

### Proposed elevation levels

| Level | Use | Visual guidance |
|---|---|---|
| 0 | Default surfaces | No shadow; define structure with spacing and colour |
| 1 | Standard raised card | Very soft, low-opacity shadow or neutral border |
| 2 | Floating control/menu | Slightly stronger shadow; clear separation from content |
| 3 | Modal/dialog | Strongest elevation in the system; use sparingly |

Exact shadow values should be tuned and reviewed in Stitch; they are not prescribed by the source Brand Kit.

---

## 6. Shape language

The brand should feel approachable and contemporary, with consistent geometry rather than a mixture of unrelated shapes.

### 6.1 Proposed corner-radius scale

| Token | Value | Use |
|---|---:|---|
| Small | 8 px | Inputs, compact chips and small controls |
| Medium | 12 px | Standard buttons and compact cards |
| Large | 16 px | Main cards, sheets and content panels |
| X-Large | 24 px | Large mobile surfaces or hero containers, used sparingly |
| Full | 9999 px | Pills, status chips and circular avatar containers |

Use the same radius for elements of the same component type. Do not mix very sharp and excessively rounded shapes on one screen.

### 6.2 Brand shapes and patterns

The Brand Kit includes a geometric brand shape and a simple house/community pattern. Use these sparingly in marketing or onboarding illustrations. Do not use decorative shapes behind dense transactional content, forms or tables.

---

## 7. Component design rules

This section is a proposed product component foundation. Final components and states should be validated in the first Stitch pilot and then reused consistently.

### 7.1 Buttons

| Variant | Use | Rules |
|---|---|---|
| Primary | The single most important action | High-contrast teal action fill, white text, clear verb label |
| Secondary | Alternative action | White/mint surface, teal border/text, lower visual priority |
| Tertiary/Text | Low-priority navigation or inline action | No filled container; use clear text and an appropriate icon only when helpful |
| Destructive | Irreversible or high-impact action | Error colour and explicit action wording; require confirmation where appropriate |

**Button rules:**
- Use action labels such as “Continue”, “Pay 30% commitment”, “Submit request”, “Confirm service” rather than vague labels such as “OK” where context matters.
- Avoid two filled primary buttons next to each other.
- Show loading, disabled, pressed and focus states.
- Prevent duplicate submissions while an action is processing.
- Target 48 dp minimum height for primary mobile controls; do not rely on the visible icon alone as the touch target.

### 7.2 Inputs and forms

- Use a persistent visible label; placeholders are examples, not labels.
- Keep helper text close to the related field.
- Validate on blur or submit where appropriate; avoid interrupting users on every keystroke.
- Put an actionable error message next to the field and provide a clear correction path.
- Distinguish required and optional fields.
- Use the correct keyboard/input mode for phone numbers, OTP, email, dates and numeric values.
- Preserve entered values when a recoverable validation or network error occurs.
- Do not clear a form after a failed payment or failed submission.

### 7.3 Cards and list rows

- Cards should group related information, not simply decorate the page.
- Use a clear title, one-line description where useful, and a visible next action.
- Service cards must use the approved service category and a concise description; do not invent extra service categories.
- Avoid multiple nested action links inside one small card.
- For repetitive operational information, prefer a structured list/table over many cards.

### 7.4 Status indicators

Use a status label plus a consistent icon/colour treatment. Never depend on colour alone.

Examples of status wording that may be used where it matches the underlying record:
- Pending verification
- Demand request submitted
- Commitment payment pending
- Commitment paid
- Awaiting service date
- Balance payment due
- Payment complete
- Booking confirmed
- Service in progress
- Service completed
- Request expired

These labels are **UI wording proposals**, not a final state-machine definition. The backend state vocabulary must be agreed in the functional/integration specifications.

### 7.5 Navigation

**Resident App — proposed starting model:**
- Home
- Services
- Activity (requests, bookings and service history under clear sub-sections)
- Support
- Profile

This is a design recommendation, not an already approved navigation contract. Validate against screen count and user testing before locking.

**Employee App — proposed starting model:**
- Today / Schedule
- Training
- Availability / Leave
- Profile

Keep attendance and service completion actions directly accessible from the assigned service occurrence. Do not bury today's work inside profile settings.

**Admin Portal:**
- One unified portal with a navigation structure filtered by per-user module permissions.
- Module access is determined by the Super Admin's per-user configuration, with optional action-level restrictions.
- Account category labels do not automatically grant a fixed module bundle.
- Cluster data scope is separate from module permission and must still be enforced.

**Public Website:**
- Clear header navigation, service information, how it works, about, FAQ and contact/enquiry paths.
- Do not add a website booking flow; the V1 website is informational and enquiry-led.

### 7.6 Feedback, dialogs and notifications

- Confirm important or destructive actions with a focused dialog that names the consequence.
- Use toast/snackbar feedback for short-lived non-critical confirmation only; important payment and service states must also appear in the relevant record view.
- In-app notification cards must distinguish unread/read states without relying on colour alone.
- Payment reminders must not imply that payment was completed.
- A successful notification delivery is not the same as a successful payment, booking or service-state transition.

### 7.7 Empty, loading and error states

Every core list and data-driven screen should have designed states for:
- Initial loading/skeleton where appropriate.
- Empty/no records yet.
- No results after filters/search.
- Network unavailable/retry.
- Permission restricted.
- Data unavailable or stale.
- Validation failure.
- Successful completion.

Avoid generic “Something went wrong” text when a useful explanation and next step can be provided.

---

## 8. Product-specific UI guardrails

### 8.1 Resident App — critical design distinction

The Resident App has two service operating experiences. They must be visually and verbally distinct so users do not mistake a demand request for an instantly confirmed service.

**Demand-led community:**
1. Resident selects a service and a configured plan.
2. Resident submits the detailed demand request (duration/hours, frequency and preferred time slots).
3. Resident pays the mandatory 30% commitment.
4. App shows that the request is a paid demand commitment—not an active service booking.
5. After Admin announces the commencement date and payment deadline, the app shows the remaining 70% balance and sends configured reminders.
6. Service activation requires verified 100% payment before service begins.
7. If the resident does not pay the remaining 70% by the configured deadline, the commitment expires unless Admin extends it before expiry. The 30% is not refunded where the resident declines to pay the remaining amount.

**Continuous mode:**
1. Resident views availability calculated from current workforce capacity.
2. Resident chooses a feasible slot.
3. App revalidates availability before payment/confirmation.
4. Resident pays 100% before service begins.
5. Booking is confirmed only after backend payment verification and capacity confirmation.

Do not show instant-service language for a demand-led request. Do not imply a 30% commitment is the full subscription payment.

### 8.2 Service scope guardrail

V1 services are **Maid, Cook and Caretaker only**. The supplied subscription/pricing example is a reference for possible plan packaging, not approved V1 service scope or final prices. Do not add Elder Care, Kids Care, Full-Time Cook or any other service category to screens unless the client formally changes scope.

The Maid category can include configurable task definitions (e.g. bowls cleaning, dusting, sweeping, mopping or washroom cleaning) selected through Admin configuration. Do not assume every Maid employee performs every task; service/task eligibility is based on the configured employee qualifications and assigned work.

### 8.3 Employee App guardrails

- Make today's assignment and next required action immediately visible.
- Standard assignments do not require employee accept/reject.
- Optional additional-work/overtime offers do require employee accept/reject, followed by Admin confirmation.
- Attendance uses the configured OTP or QR method. Location evidence is event-based at the verification moment; do not design continuous employee location tracking.
- Keep training simple and video-based; do not design a full LMS.
- Keep employee-facing UI clear, low-literacy-friendly and task-oriented without making assumptions about users' capabilities.

### 8.4 Admin Portal guardrails

- One unified dashboard, not six separate dashboard applications.
- Super Admin creates Admin users and grants each user selected module access; action-level restrictions can be applied when needed.
- Every route, query and action must respect backend permission and applicable cluster data scope.
- Design for operational clarity: search, filters, status, next action and audit context.
- Use dense tables only where they help operational work; retain readable row height and clear column hierarchy.
- Never show module access merely because of an account label/category.

### 8.5 Public Website guardrails

- It is informational and enquiry-led.
- It may explain services, how it works, brand, FAQ, legal pages and careers information.
- Contact/enquiry submissions route to the approved Support destination.
- Do not add online service booking or recruitment ATS functionality.

---

## 9. UX heuristics translated into Nestovin rules

| UX principle | Nestovin design application |
|---|---|
| Jakob's Law | Use familiar navigation, form fields, booking summaries, payment patterns and standard mobile interaction conventions. |
| Hick's Law | Show only the three approved service categories as primary choices; reveal plan details only when relevant. |
| Progressive Disclosure | Keep the initial view concise; expand task coverage, plan conditions and detailed status when needed. |
| Recognition over Recall | Show selected community, flat, service, plan, payment amounts and next step in context. |
| Consistency and Standards | Reuse component patterns, wording, spacing and visual states across all product surfaces. |
| Visibility of System Status | Clearly indicate request, payment, booking, service and support status. |
| Error Prevention | Validate community, flat, plan, price, slot and payment context before committing an action. |
| User Control and Freedom | Provide clear back/edit paths before payment; explain consequences for irreversible or deadline-bound steps. |
| Match to the Real World | Use familiar terms such as Flat, Community, Maid, Cook, Caretaker and Service Date. |
| Accessibility | Provide readable contrast, labelled inputs, focus states, screen-reader names and adequate touch targets. |

---

## 10. Accessibility and usability acceptance baseline

Target **WCAG 2.2 Level AA** for the digital product interfaces. This is a proposed product quality target, not a claim that the current brand palette automatically passes every pairing.

### 10.1 Contrast

- Normal-size text: at least 4.5:1 against its background.
- Large text: at least 3:1.
- Essential UI boundaries and meaningful graphical objects: at least 3:1 where WCAG requires non-text contrast.
- Check each actual foreground/background pair, including disabled, hover, pressed, selected and error states.
- The approved brand teal and green are not suitable as small white-on-colour text fills without the darker UI action variants defined in Section 2.6.

### 10.2 Interaction and input

- Use a minimum 48 dp target for primary mobile touch controls as the design target; ensure adjacent controls have enough separation.
- Provide visible keyboard focus on web interfaces.
- Do not rely only on hover for important actions or information.
- Labels must remain visible; placeholders are not a substitute.
- Provide clear validation messages and do not communicate errors using colour alone.
- Ensure screen layouts support text resizing without clipping or hiding actions.
- Respect reduced-motion settings; animation must not be required to understand the workflow.

### 10.3 Content and screen-reader support

- Use meaningful accessible names for icons and controls.
- Hide purely decorative images/icons from assistive technology.
- Use headings in a logical hierarchy.
- Announce important state changes such as payment success/failure and request submission.
- Do not place essential text inside images.
- Use plain language; explain operational terms where they may be unfamiliar.

### 10.4 Usability validation

For the Resident App pilot, test at least:
- Can a resident understand the difference between demand collection and a confirmed booking?
- Can a resident identify the exact 30% paid amount and remaining 70%?
- Can a resident see the commencement date and deadline without searching?
- Can a resident distinguish Maid, Cook and Caretaker and understand what is included in a configured plan?
- Can a resident recover from a failed payment or network interruption without accidentally creating duplicate requests?

For the Employee App, test whether an employee can identify today's assignment, attendance action and completion action without training from an administrator.

For the Admin Portal, test whether a user understands what modules/actions they have access to and whether the interface prevents accidental publication, approval or destructive changes.

---

## 11. Imagery, iconography and motion

### 11.1 Photography

Follow the Brand Kit's warm, natural, clean residential image style.

- Use believable apartments, homes and community spaces.
- Show people and workers respectfully and professionally; avoid exaggerated luxury imagery or stereotyped depictions.
- Prefer genuine, context-relevant photography over decorative stock photos.
- Use images to establish trust or explain a service, not to fill empty space.
- Keep image crops, corner treatments and overlays consistent.
- Do not use a photo as the only way to communicate a service or important instruction.

### 11.2 Iconography

- Use a single clean, minimal icon family with consistent stroke weight and optical sizing.
- Follow the Brand Kit's service icon direction for Maid, Cook and Caretaker and the simple home/community icons.
- Pair unfamiliar icons with text labels.
- Avoid mixing filled, outlined, 3D and emoji icon styles in one interface.
- Do not invent alternate Nestovin service symbols that imply services outside V1.

### 11.3 Motion

- Motion should confirm state changes, reveal hierarchy or guide attention.
- Use subtle transitions for selection, navigation and status feedback.
- Avoid decorative animations, parallax, excessive bounce or constant motion.
- Respect reduced-motion preferences.
- Do not delay a critical payment or booking interaction for a decorative animation.

---

## 12. Stitch workflow and prompting standards

Google describes Stitch as an AI-native design canvas that can create and iterate on high-fidelity UI from natural language, keep project context on an infinite canvas, use a design agent, support interactive prototypes, and import/export design rules through `DESIGN.md`. The `DESIGN.md` format is open-sourced as a portable design-system representation. See the source notes in Section 15.

### 12.1 Project organisation

Create separate Stitch projects for the distinct product surfaces, while applying the same approved design system:

1. `Nestovin — Resident App`
2. `Nestovin — Employee App`
3. `Nestovin — Unified Admin Portal`
4. `Nestovin — Public Website`

Do not mix mobile app screens and desktop Admin screens in one unstructured canvas. Reuse the same `DESIGN.md` and approved brand assets in each project.

### 12.2 Recommended generation sequence

1. Create the Resident App project.
2. Import/apply `DESIGN.md` as the project's design system.
3. Add the approved logo assets and any relevant brand-kit reference images.
4. Generate a small pilot of three representative screens: Resident Home, Service/Plan Selection and Demand/Payment Status.
5. Review each screen for hierarchy, spacing, action clarity, accessibility and business-rule correctness.
6. Refine the existing screens with targeted instructions; do not restart from generic prompts when the layout is already sound.
7. Connect screens into a clickable prototype and test the primary journeys.
8. Freeze reusable components/patterns, then expand to the full Resident App.
9. Repeat the process for Employee App, Admin Portal and Public Website.

### 12.3 Prompt structure

A strong Stitch prompt should specify:

- **Project context:** what Nestovin is and which product surface is being designed.
- **User and task:** who is using this screen and what they need to accomplish.
- **Current state:** where the user is in the business workflow.
- **Primary action:** the single action that should dominate the screen.
- **Required content:** fields, data, labels, status and important context.
- **Alternative/error states:** what can happen if the normal path cannot continue.
- **Layout:** hierarchy, sections, navigation, cards/lists and responsive behaviour.
- **Accessibility:** contrast, target size, persistent labels, focus and text scaling.
- **Constraints:** features/services that must not be introduced.

Once the design system has been applied at the Stitch project level, screen-generation prompts should focus primarily on user intent, layout, structure and content. Avoid repeatedly overriding colours and fonts in each prompt unless a precise local exception is needed.

### 12.4 Starter prompt — Resident Home pilot

> Design the Resident Home screen for Nestovin, a community-first home-services company offering only Maid, Cook and Caretaker services. This is a mobile application screen for a resident who has authenticated and has an approved residence association. The screen must make the selected community/flat context clear, present the three service categories as the primary choices, and show the resident's most relevant active request or service status when one exists. If the resident has no active request, provide a clear next step to explore services. Use a simple top-level hierarchy, concise labels, clear service cards and one dominant primary action. Avoid marketplace-style provider browsing, extra service categories, promotional clutter, dense dashboards and unconfirmed features. Apply the project's existing Nestovin design system; do not invent new colours or fonts. Include an empty state and a returning-resident state.

### 12.5 Starter prompt — Service and plan selection pilot

> Design the Resident App service and plan selection screen for one of Nestovin's approved services: Maid, Cook or Caretaker. The resident must be able to understand the configured service coverage, frequency/duration and community-specific price before selecting a plan. Use progressive disclosure: show the essential comparison first, with detailed task coverage and terms available on demand. Do not invent plan names, prices, discounts, entitlements or service tasks; use clearly labelled sample placeholders where real configuration has not been supplied. Keep the selected community and residence context visible. Apply the existing project design system and accessibility rules.

### 12.6 Starter prompt — Demand and payment status pilot

> Design a Resident App status screen for a demand-led service request. The resident has submitted a request and paid the mandatory 30% commitment. Clearly distinguish this paid demand commitment from a confirmed/active service. Show the amount already paid, the remaining 70%, the current demand status, and the next expected step. If the service commencement date has not yet been announced, say that the resident is awaiting the announced date; do not invent a date. If the date and payment deadline are available, display both clearly and provide the balance-payment action. Include a payment-pending/failure state without implying that payment succeeded. Do not create an instant-booking promise. Apply the existing project design system.

### 12.7 Design review loop

After each Stitch generation, review:
- Is the screen faithful to the approved workflow?
- Is the primary action obvious?
- Is there one clear visual hierarchy?
- Are prices, dates, payment amounts and service status unambiguous?
- Are all colours and typography drawn from the design system?
- Are contrast, touch targets and text scaling acceptable?
- Is content concise and free of invented product features?
- Does the screen connect naturally to the next screen in the prototype?

---

## 13. UI quality checklist

A screen is ready for design sign-off only when all applicable checks pass.

### Brand consistency
- [ ] Approved logo variant and clear space used correctly.
- [ ] Brand colour palette not modified.
- [ ] Manrope and Inter used in their defined roles.
- [ ] Icon family and image style are consistent.

### Visual hierarchy
- [ ] Screen purpose is apparent at first glance.
- [ ] One dominant primary action is clear.
- [ ] Spacing and alignment follow the shared scale.
- [ ] Cards/containers are used only when they group meaningful content.
- [ ] Important content is not buried below decorative elements.

### UX and functional accuracy
- [ ] Screen matches the current functional workflow.
- [ ] Demand request is not presented as a confirmed booking.
- [ ] Payment milestones are accurately represented.
- [ ] Service categories are restricted to Maid, Cook and Caretaker.
- [ ] No unapproved feature or policy has been introduced.

### Accessibility
- [ ] Text/background contrast has been checked.
- [ ] Colour is not the only status indicator.
- [ ] Touch targets and spacing are adequate.
- [ ] Labels, focus and error messages are clear.
- [ ] Layout supports text scaling and responsive widths.

### States and completeness
- [ ] Default state designed.
- [ ] Loading state designed where needed.
- [ ] Empty/no-results state designed where relevant.
- [ ] Validation/error state designed.
- [ ] Disabled/restricted state designed.
- [ ] Success/confirmation state designed.

---

## 14. Decisions and boundaries

### Fixed by the supplied Brand Kit

- Primary brand palette: `#00897B`, `#43A047`, `#F5FAF9`, `#111827`.
- Neutral and semantic colour definitions listed in this document.
- Typography families: Manrope and Inter.
- Typography hierarchy and approved logo variants/usage rules.
- Warm, natural, clean imagery and minimal consistent icon style.

### Proposed by Nexif for product UI and subject to design review

- Accessible dark action variants for teal/green.
- Spacing scale, radius scale, component sizing and elevation levels.
- Responsive breakpoints and reference frame sizes.
- Resident/Employee navigation starting models.
- Component state patterns and screen-generation prompts.
- WCAG 2.2 AA as the product accessibility target.

### Not assumed or not fixed by this document

- Final technology stack or native implementation framework.
- Final plan names, prices, task entitlements or package content.
- Any new service category beyond Maid, Cook and Caretaker.
- Final status-state machine or exact status vocabulary.
- Final cancellation, rescheduling, refund or legal terms.
- Final Resident App tab structure, pending usability review.
- Final employee app attendance or resident confirmation screen sequence.
- Final Admin module navigation labels and permission matrix.

Changes to approved brand assets or contractual feature scope must be handled separately from routine visual refinement.

---

## 15. Source notes

### Supplied Nestovin source

1. **Nestovin Brand Kit, pages 2–5:** Logo system and use (page 2); primary, neutral and semantic palettes, tints/shades and colour usage (page 3); Manrope/Inter typography families, weights, hierarchy, buttons and form examples (page 4); correct/incorrect logo usage, backgrounds, brand elements and icon style (page 5).
2. **Nestovin functional workflow baseline:** `01_individual_module_workflows.md`, NV-FWS-01, Version 0.1. Used to preserve approved V1 service categories, demand-led/continuous distinctions, Admin permissions and product workflow constraints.

### External format and accessibility references

3. **Google Labs, “Introducing vibe design with Stitch”, 18 March 2026:** Stitch's AI-native canvas, project context, design agent, `DESIGN.md`, interactive prototypes and design-to-code workflow. <https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-ai-ui-design/>
4. **Google Labs, “Stitch’s DESIGN.md format is now open-source”, 21 April 2026:** `DESIGN.md` is intended to make design rules portable between projects and tools. <https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-design-md/>
5. **Google Labs Code, DESIGN.md specification:** YAML design tokens plus human-readable sections; canonical section order and supported token groups. The published format is evolving; validate the file against the current specification when importing. <https://github.com/google-labs-code/design.md/blob/main/docs/spec.md>
6. **W3C, WCAG 2.2:** Accessibility conformance criteria and contrast requirements. <https://www.w3.org/TR/WCAG22/>

---

**End of document — NV-DS-01, Version 1.0.**
