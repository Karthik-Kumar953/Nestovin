# Nestovin public website: plan

Status: draft for the owner's approval, 22 Nov 2026. No code yet.

## 1. What the website is for

The client wants market presence today. A visitor should leave knowing three things:

1. **What Nestovin is:** maid, cook and caretaker services inside gated communities, delivered by Nestovin's own salaried, verified staff. It is not a marketplace of freelancers.
2. **Why it is safer and more reliable** than finding help through word of mouth.
3. **What to do next:** send an enquiry, bring Nestovin to their community, or apply to work with us.

Out of scope: booking, prices and plans, accounts and payments. The apps show "Coming soon".

## 2. Who visits, and what each needs

| Visitor | Their question | Where the site answers it |
|---|---|---|
| Resident of a gated community | "Can I trust someone in my home? What exactly will they do? Is it in my community?" | Home, Services, How it works, Trust, Enquiry |
| Community committee / RWA / facility manager | "What does it take to bring this to our community, and what work does it create for us?" | For communities, Enquiry (community type) |
| Job seeker (maid, cook, caretaker) | "Is this a steady, salaried job? How do I apply?" | Careers, Enquiry (careers type) |
| Press, partners, investors | "Who are these people?" | About, Contact |

The third and second audiences are what most home-services sites ignore. They are also where Nestovin's model is different, so each gets its own page.

## 3. Site map and why each page exists

| Page | Its one job | Key content |
|---|---|---|
| **Home** | Explain the idea in one screen and route each visitor to their page | Thesis headline; "a day at your flat" story; three services; the managed-vs-marketplace difference; trust proof; for-communities band; enquiry CTA |
| **Services** (overview + Maid, Cook, Caretaker) | Show exactly what is included, so "managed" feels concrete | Tasks per service, visit frequency, time windows, what is not included, Caretaker as an add-on. No prices. |
| **How it works** | Show the mechanism end to end | Community joins → residents register flat → service starts (demand round or open slots) → the visit (OTP check-in) → replacement if someone is absent → support |
| **Trust and safety** | Earn the right to enter someone's home | Verification steps, training, salaried staff, attendance check-in, privacy of resident data, how complaints are handled |
| **For communities** | Win the committee, which unlocks a whole community | Why committees choose a managed service, what Nestovin handles, the onboarding steps, enquiry |
| **Careers** | Recruit workers and signal that staff are treated well | Salaried work, training, nearby work within a cluster, how to apply |
| **About** | Who is behind it and why | Origin, beliefs, where we operate |
| **FAQ** | Remove last doubts | Grouped by resident, community, careers |
| **Contact / Enquiry** | Turn intent into a lead | One form with enquiry types (resident, community, careers, other), posting to `POST /v1/public/enquiries`; email and phone |
| Privacy, Terms | Legal | Footer only |

## 4. The concept: meaning before decoration

**Thesis:** *Home help, run like a service.* Every page shows the system working rather than claiming it works.

**Signature moment (Home): "A day at your flat."** As you scroll, a single day plays out on a clock:

- 7:00: the cook arrives
- the resident shares a check-in code, and the visit is verified
- 9:00: the maid's visit
- a mid-day message shows the replacement when someone is on leave
- evening: the caretaker arrives

Each step is one line of copy and one image or film beat. This animation explains the product. It is not decoration.

**Supporting motion, each with a reason:**

- **How it works:** the steps draw in as you reach them, so the order is clear.
- **Services:** task lists reveal in groups, by frequency (daily, weekly, monthly).
- **Trust:** each verification step ticks off in sequence.
- **Everywhere:** gentle entrance motion only. All motion is off under reduced-motion settings, and content is always visible without it.

**Not included:**

- no 3D
- no scroll-jacking
- no counters with invented numbers
- no fake testimonials or client logos. There are no real figures yet, so the site makes no claims it cannot back.

## 5. Look and feel

- **Brand:**
  - teal `#00897B`; filled buttons in `#00796B` for contrast
  - green `#43A047`, charcoal `#111827`, ground `#F5FAF9`
  - Manrope headings, Inter body, lucide icons
  - sentence case, no emoji
- **Register:** premium, calm, Indian, lived-in. Real homes and real people, never glossy stock.
- **Colour use:** teal owns whole regions (the hero, the for-communities band and the footer), not scattered accents.
- **Imagery:** one consistent Nestovin staff look (teal polo, small white house emblem) across every photo and film, so the brand is recognisable even without the logo.
- **Process:** before building, a direction board with 3 first-screen compositions, to be locked in one round.

## 6. Images and film

Generated in Google Flow from detailed master prompts that set camera, lens, light, wardrobe, set dressing and palette. The same staff characters and uniform are reused across every shot. The list builds on `Website_Image_Prompts.md`:

- **Hero film:** "a day in a cared-for home", an 8–12 s loop.
- **Day-at-your-flat beats (4 stills or short clips):**
  - cook at 7:00
  - check-in at the door
  - maid at 9:00
  - caretaker in the evening
- **Service photos:** maid, cook, caretaker.
- **Community exterior:** golden hour.
- **Team photo** for Careers and About.
- **Verification / training moment** for Trust.
- **Social sharing image.**

Every page works without the media, so a missing shot never blocks launch.

## 7. Build

- Next.js app `apps/web`, public route group, Tailwind v4.
- GSAP ScrollTrigger for the day story; Motion for small transitions.
- Static pages. Lighthouse accessibility 95 or higher, fast on mobile.
- The enquiry form is wired to the existing API, with honeypot and rate limit.

## 8. What I need from the owner

1. **Cities and communities to name**, or keep it general ("gated communities in …").
2. **Real contact details** for the Contact page: email, phone, office address.
3. **Founder or about story**: two or three lines in your words. If not, I draft it and you approve it.
4. **Go-ahead for me to generate in Google Flow and save the results** into `apps/web/public/site/`. It uses your Flow credits.
