# Nestovin public website: concept and content

Status: proposal for approval. Nothing is built from this until the owner approves it.
Sources: PRD v1.1 (§1, §2, §4.3, §5, §9, §10, §12, §18), Final module workflows v1.0, PRODUCT.md, DESIGN.md, `apps/web/src/site/content.ts`.
Method: impeccable (shape, Persuade mode) and ui-ux-pro-max (pattern "Trust and authority" with scroll-triggered storytelling; its suggested blue and orange palette and Poppins type are overridden by DESIGN.md).

---

## 1. What the website has to do

| Visitor | Arrives because | Leaves having |
|---|---|---|
| Resident of a gated community | Tired of arranging, chasing and replacing help, or heard Nestovin is coming to their society | Understood how Nestovin is different and sent an enquiry (or asked for their community) |
| Committee member, RWA or facility manager | Evaluating a provider for the whole community | Understood the onboarding and the resident-led model, and asked for a conversation |
| Job seeker | Wants steady, respected work near home | Understood salary, training and how to apply through the form |
| Family member, often in another city, arranging care for parents | Wants someone dependable and accountable | Understood caretaker scope and how visits are checked in |

One primary action everywhere: **Send an enquiry.** Everything else supports it.

## 2. The idea behind the concept

Reading the PRD, Nestovin is not "find a maid online". Four things are true of Nestovin and of no marketplace:

1. **It works community by community.** Nestovin onboards a whole gated community, maps every tower and flat (City → Community → Tower → Flat), and builds a team for that community and its cluster.
2. **Residents decide together.** In demand-led communities, residents register their need during a collection round; Nestovin staffs the community to match the demand, publishes the time slots, and the service starts when each flat completes payment. In continuous communities, slots are already open.
3. **Nestovin assigns the person, not the resident.** Residents choose a service, plan and time; Nestovin assigns a verified, trained employee from the community's team and arranges a replacement from the same team when needed.
4. **Every visit is proven at the door.** The visit starts with the resident's one-time code (or QR), with location captured only at that moment. No live tracking of staff.

The brand tagline already says it: **"A home that brings people together."** Nestovin's model literally brings a community's homes together to make good home help possible.

### Concept: "The community lights up"

The site is built around one drawn object: **a residential tower in clean line drawing** (charcoal hairlines on white and mint, windows as small rounded rectangles). It is the same tower on every page, and it *performs* how Nestovin works:

- Windows light up teal as residents register interest (the community deciding together).
- A small Nestovin team appears at the gate when the community is staffed.
- One window (flat 1204) is followed through a day: a fixed person, a fixed time, a code at the door, a green check when the visit is done.

This is not decoration: each animation state is a real step of the operating model in PRD §2.1, so a visitor learns the product by watching it. Photography (the six Flow images) shows the human side: the cook, the maid, the caretaker, the door check-in, the community, the team.

Why this beats the alternatives:
- A generic hero with a stock photo and three cards says "home services", not "Nestovin".
- The lobby-board idea showed a schedule but not the community model, which is Nestovin's real difference.
- The tower carries the whole story: community, flats, demand, team, door, visit.

## 3. Visual world (DESIGN.md only)

| Role | Token | Value |
|---|---|---|
| Page background | background / surface | `#F5FAF9` mint, `#FFFFFF` white |
| Line drawing, headings | brand-charcoal | `#111827` |
| Body text | text-primary / text-secondary | `#1F2937` / `#4B5563` |
| Hairlines, unlit windows | border / surface-subtle | `#E5E7EB` / `#F1F5F9` |
| Lit windows, brand moments | primary | `#00897B` |
| Buttons | teal-action, hover teal-deep | `#00796B`, `#00695C` |
| Visit done, verified | secondary / green-action | `#43A047` / `#2E7D32` (text on green) |
| Status chips | success, warning, info triads | always with a text label |
| Dark band (one per page at most) | brand-charcoal | `#111827` |

- Type: Manrope 700/600 for headings (H1 56/64 desktop, 32/40 mobile per DESIGN.md), Inter for body (16 to 18 px).
- Shapes: radius 8/12/16/24 only; photos at 16 px; no glass, no gradient text, no heavy shadows.
- Icons: lucide line icons, one stroke weight.
- No eyebrow labels above headings; numbered steps only where the order matters (How it works).

## 4. Motion map (meaning only)

| Where | What moves | What it means | Reduced motion |
|---|---|---|---|
| Home hero | Tower windows light up one by one, then a team of three figures appears at the gate | Residents decide together; Nestovin staffs the community | Final lit state, static |
| Home, "A day at flat 1204" (scroll) | Camera moves into flat 1204; the day advances 07:00 → 07:02 → 09:00 → 18:00 with photos | Fixed person, fixed time, code at the door, visit recorded | Four static panels |
| How it works | Six-step path; the active step's tower state updates beside it | Each step of the operating model | Static steps |
| Trust | Each check stamps in as it scrolls into view | Checks happen in sequence, before and during work | Static list |
| Buttons, links, tiles | 150 to 250 ms colour and lift | Feedback | Kept (not motion-heavy) |

Rules: one authored moment per page, interruptible, pause control on anything that loops, no scroll-jacking, no counters with invented numbers.

## 5. Site map

Header: Services · How it works · Trust · For communities · Careers · About · **Send an enquiry** (button)
Footer: services, company links, FAQ, contact, privacy, terms, app badges ("Coming soon" for App Store and Google Play), tagline.

Pages: Home, Services (+ Maid, Cook, Caretaker), How it works, Trust and safety, For communities, Careers, About, FAQ, Contact and enquiry, Privacy, Terms, 404.

---

## 6. Page content

Copy is final draft unless marked **OWNER** (needs the owner's facts). No prices, no numbers, no testimonials.

### 6.1 Home

**Hero** (tower animation on the right; photo-free so the idea is clear)
- H1: **Home help, organised for your whole community.**
- Lede: Nestovin brings trained maids, cooks and caretakers to gated communities. We employ them, verify them, and check in every visit at your door.
- Primary button: Send an enquiry. Secondary: See how it works.
- Under the buttons, three plain facts with check icons: Salaried Nestovin staff · Same person, same time · Checked in at your door.
- Caption under the drawing: Illustration. Each lit window is a home that asked for Nestovin.

**Section: Three ways in** (path selection, ui-ux-pro-max "I am a...")
- H2: Where would you like to start?
- I live in a gated community → What Nestovin does for your home. Link: How it works
- I help run a community → Bring Nestovin to every tower. Link: For communities
- I want to work with Nestovin → Steady, salaried work near home. Link: Careers

**Section: A day at flat 1204** (scroll story, photos)
- H2: A day at flat 1204
- Lede: What Nestovin looks like from your side of the door. Sample day.
- 07:00 · Your cook arrives. Assigned to your flat by Nestovin: the same person, at the same time, for your whole plan. (photo: svc-cook) chip: Arriving
- 07:02 · The visit starts with your code. You share a one-time code from the app at the door. The visit is recorded, with the time and place of check-in. (photo: door-checkin) chip: Checked in
- 09:00 · Your maid, or her trained replacement. If your usual person is on leave, Nestovin arranges a replacement from your community's trained team. (photo: svc-maid) chip: Checked in
- 18:00 · Evening hours for your parents. A caretaker spends set hours with the elders at home, added to your plan. (photo: svc-caretaker) chip: Scheduled
- Close: After each visit, you can confirm it and leave feedback in the app.

**Section: Not a marketplace**
- H2: You choose the service. We take care of the rest.
- Body: On a marketplace you browse profiles, negotiate, and manage the person yourself. With Nestovin you choose a service, a plan and a time; Nestovin employs, trains, assigns and replaces the staff.
- Comparison table (Nestovin | On your own):
  - Who employs the worker: Nestovin, on a monthly salary | You, or nobody
  - Checks before day one: Identity and documents verified, training completed | Rarely done
  - When someone is on leave: A replacement from the same trained team | You find someone
  - Proof of each visit: Checked in with your code | Your memory
  - Paying: Through the app, to Nestovin | Cash, to the person
  - When something goes wrong: A support request with an owner and a deadline | An awkward conversation

**Section: Services** (three photo tiles: Maid large, Cook and Caretaker beside it)
- H2: Three services, done properly
- Lede: Nestovin offers only what it can run well.
- Maid: Daily cleaning and upkeep of your home.
- Cook: Home-style meals, cooked fresh in your kitchen.
- Caretaker: Company and everyday help for elders, added to a maid or cook plan.
- Note: Plans and prices are set for each community and shown in the Nestovin app.

**Section: How your community joins** (tower lighting up, compact)
- H2: It starts with your community
- Body: Nestovin starts in a community when its residents ask for it. We map your towers and flats, agree time windows with the committee, and build a team for your community.
- Steps: Residents ask → Nestovin maps the community → Residents choose plans → The team starts, flat by flat.
- Button: Ask for Nestovin in your community.

**Section: Trust strip**
- H2: Trust, checked at every step
- Before joining: identity and documents verified · Before the first visit: trained for the work and the home · Every visit: checked in with your code · Always: staff see only your first name, tower and flat.
- Link: How we keep your home safe.

**Section: Careers band** (wrk-team photo)
- H2: Steady work, close to home
- Body: Nestovin hires maids, cooks and caretakers on a monthly salary, trains them, and assigns them to homes near where they live.
- Button: Work with Nestovin.

**Closing band** (teal)
- H2: Want Nestovin in your community?
- Body: Tell us where you live and what you need. We will tell you honestly where things stand.
- Button: Send an enquiry.
- App badges: Nestovin for iPhone and Android, coming soon.

### 6.2 Services

- H1: Maid, cook and caretaker
- Lede: Three services, each done by a Nestovin employee who is verified, trained and assigned to your flat. What is included depends on the plan your community offers; you see the full list in the app before you choose.
- One alternating row per service (photo, name, usual timing, summary, four key tasks, link to detail).
- Closing note: Prices are not shown here because they are set per community and per home size. Once your community is live, the app shows exactly what your flat can choose.

**Maid** (detail page)
- Summary: The same trained housekeeper keeps your home in order on a fixed schedule. Daily work is done every visit; deeper cleaning follows the plan your community offers.
- Every visit: sweeping and mopping; dusting surfaces and furniture; washing utensils; kitchen counter and sink; taking out the trash.
- Weekly, by plan: bathroom cleaning; balcony and window sills; fridge exterior and appliances.
- Monthly, by plan: deep cleaning of washrooms; fans and fixtures; wardrobe and shelf wipe-down.
- Not included: work outside your flat; lifting heavy furniture; hazardous chemicals.
- Usual timing: morning or afternoon windows agreed with the community.
- **OWNER:** confirm task lists with Operations.

**Cook** (detail page)
- Summary: A trained cook prepares your family's everyday meals in your kitchen, to your taste, with the ingredients you keep at home.
- Every visit: chopping and preparation; cooking the meals you plan; kitchen wipe-down after cooking.
- By plan: one or two meals a day; simple tiffin packing; weekly menu planning with you.
- Not included: grocery shopping; cooking for large events; washing all household utensils (part of the maid service).
- Usual timing: morning and evening windows.
- **OWNER:** confirm task lists.

**Caretaker** (detail page)
- Summary: A caretaker spends set hours with an elder at home: company, small daily help, and a calm presence while the family is away.
- During the visit: companionship and conversation; help with tea, snacks and meals; reminders for routine medicines; short walks within the community.
- Not included: medical or nursing care; injections or treatment; overnight stays.
- Note (info chip): Caretaker is an add-on to a maid or cook plan, not a standalone service.

### 6.3 How it works

- H1: From your community joining to the first knock on your door
- Lede: Nestovin works community by community. Here is every step, in the order it happens. (tower drawing updates beside each step)

1. **Your community joins.** Nestovin maps your community's towers and flats, agrees service time windows with the committee, and publishes the plans offered there.
2. **You sign in and register your flat.** Sign in to the Nestovin app with your phone number, choose your tower and flat, and share proof that you live there. Services open once your flat is verified. Family members can be added after a check by our team.
3. **You choose a service and plan.** The app shows the services, plans and time windows for your home. Your community opens in one of two ways:
   - *Open slots:* time slots are already available. Choose one and pay for the plan in the app; the booking is confirmed once payment is verified.
   - *Demand first:* residents register what they need during a collection round, with part of the amount paid up front. When the round closes, Nestovin staffs the community and publishes time slots; you pay the balance to start. A request is not a booking until then.
4. **Nestovin assigns your person.** A verified, trained employee from your community's team is assigned to your flat and time. You don't pick from profiles; we match the right person to the work.
5. **Every visit is checked in.** The visit starts when you share your one-time code at the door. Start and finish are recorded, and you can confirm the visit and leave feedback.
6. **Help when you need it.** Raise a request in the app. Each request has an owner and a deadline, and moves up to a senior manager if it is late.

- Section "What you will never be asked to do": pay staff in cash; find a replacement yourself; track anyone's location.
- Closing band.

### 6.4 Trust and safety

- H1: Someone you can let into your home
- Lede: Trust is not a badge on a website. It is a set of checks that happen before someone joins, before the first visit, and at your door every day.
- Timeline:
  - Before joining: **Identity and documents verified.** Each person's identity and documents go through a verification checklist reviewed by our HR team.
  - Before the first visit: **Trained for the work and the home.** Training covers the service, hygiene, conduct in a family home and the check-in app.
  - Every month: **Employed and paid by Nestovin.** Staff are on Nestovin's monthly payroll, not paid in cash by the visit.
  - Every visit: **Checked in at your door.** A one-time code or QR from your app starts the visit; time and location are recorded at that moment.
  - Always: **Your details stay private.** Staff see only what the visit needs: your first name, tower and flat.
  - Whenever you need: **Concerns go to a person.** Every request has an owner and a deadline, and moves up if it is late.
- Section "Fair to the people who work in your home": location is recorded only at check-in, never tracked continuously; staff have a fixed schedule, a uniform and an employee ID.
- **OWNER:** confirm the exact verification checklist wording (for example whether police verification is part of it) before launch.

### 6.5 For communities

- H1: Bring Nestovin to your community
- Lede: One accountable provider for home help across every tower, with staff who are verified, uniformed and checked in at each flat. Residents decide; the committee is not asked to buy anything.
- What changes (four points): one accountable provider; less load on the gate (staff scheduled to specific flats and times, every visit checked in); residents decide individually; local, steady jobs.
- How we start (numbered, the order matters): a conversation with the committee or facility manager → we map towers and flats and agree time windows → residents register their interest in the app → we hire and train a team for your community → service starts, flat by flat.
- Not yet in your city? Residents can ask for Nestovin in their city or community; the more homes ask, the sooner we plan it. (App voting is coming with the apps; until then, use the enquiry form.)
- Button: Talk to us about your community (enquiry, type preset to community).

### 6.6 Careers

- H1: Steady work, close to home
- Lede: Nestovin hires maids, cooks and caretakers on a monthly salary, trains them, and assigns them to homes in communities near where they live.
- What you get: a monthly salary; training before you start; work near home; respect and support (uniform, employee ID, fixed schedule, a team to call).
- Roles: Maid (housekeeping) · Cook · Caretaker for elders.
- How to apply: Send your details through the enquiry form and choose "I want to work with Nestovin". Our HR team will call you to arrange a meeting and the verification steps.
- Note: Nestovin does not take applications or fees through any other channel. **OWNER:** confirm this line.

### 6.7 About

- H1: Why Nestovin
- Story (**OWNER**, replace with the founders' words): In most Indian homes, finding reliable help still depends on a neighbour's recommendation, and managing it is a second job. Nestovin was started to run home help the way a good service is run: we employ our staff, verify and train them, build a team for each community, and stand behind every visit.
- Beliefs: dignity for the people who work in our homes; trust shown, not promised; communities first.
- Tagline close: A home that brings people together.

### 6.8 FAQ

For residents
- Is Nestovin available in my community? We work in selected gated communities and add new ones as residents ask. Send an enquiry with your community name.
- Why are there no prices on the website? Plans and prices are set per community and home size, and shown in the app once your community is live and your flat is verified.
- Can I choose who comes to my home? Nestovin assigns a trained person from your community's team. You get the same person for your plan, with a replacement from the same team when needed.
- How do I know the visit happened? Each visit starts with a one-time code you share at the door, and the start and finish are recorded in your app.
- Do I pay the worker directly? No. You pay Nestovin in the app, and Nestovin pays its staff a monthly salary.
- What does "demand first" mean? In some communities, residents first register what they need during a short round with part of the amount paid up front. Nestovin then staffs the community, publishes time slots, and you pay the balance to start. Your request is not a booking until that is done.
- Is a caretaker a nurse? No. Caretakers give company and everyday help; they do not give medical or nursing care.

For communities
- Does the committee have to buy anything? No. We need the committee's agreement to operate; residents choose individually.
- How long does it take to start? It depends on resident demand and hiring. We share a plan after the first conversation.

For job seekers
- Do I need experience? It helps, but everyone is trained before their first visit.
- How do I apply? Through the enquiry form: choose "I want to work with Nestovin".

### 6.9 Contact and enquiry

- H1: Send us an enquiry
- Lede: Whether you want help at home, want Nestovin in your community, or want to work with us, start here. A person from our team reads every enquiry.
- Visible contact details: **OWNER** phone, email, office address; hours Monday to Saturday, 9 am to 7 pm (**OWNER** confirm).
- Form: What is this about? (I want Nestovin at home / I represent a community / I want to work with Nestovin / Something else) · Your name* · Mobile number* (10 digits) · Email · City · Community or society name · How can we help?* · consent checkbox ("Nestovin may contact me by phone, SMS or email about this enquiry") · hidden honeypot. Posts to `POST /v1/public/enquiries`.
- Success: "Thank you, we have your enquiry. Someone from Nestovin will call you on the number you gave us. Your reference is NV-…". Never says "booked" or "confirmed service" (PRD §12).
- Errors: field-level messages; rate-limit message; network failure with retry.

### 6.10 Privacy, Terms, 404

- Privacy and Terms: **OWNER/legal** text. Until then, a short honest notice of what the website collects (enquiry form fields only) and that booking and payment happen only in the app.
- 404: "This page has moved out." Links to Home and Contact.

---

## 7. Assets

| Asset | Status |
|---|---|
| Six photos (cook, maid, caretaker, door check-in, community towers, staff team) | Done, `apps/web/public/site/` |
| Tower line drawing (SVG, authored in code from the brand palette) | To build |
| Team figures for the gate moment (simple line figures in uniform teal) | To build |
| Hero film | Optional; owner to generate in Flow (prompt in `Website_Image_Prompts.md`) |

## 8. Open items for the owner

1. Contact phone, email and address.
2. Cities and communities to mention (or none until launch).
3. Founder story for About.
4. Task lists per service (Operations).
5. Staff verification checklist wording.
6. Privacy policy and terms text.
