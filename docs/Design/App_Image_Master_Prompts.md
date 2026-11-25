# Nestovin app images: master prompts

Every image the **Resident** and **Worker** apps use, with an in-depth prompt for each.
The apps already run without them (each slot shows a designed fallback), so you can add images in any order.

## How to deliver

1. Generate each image and save it in `docs/Design/images/` with the **exact file name** in the tables below.
2. Run `pnpm images` in `apps/resident` and `node scripts/sync-images.cjs` in `apps/employee` (or ask me to). The apps pick the files up automatically.
3. Photos: JPG, at least the size listed (bigger is fine, same aspect). Illustrations: PNG with a **transparent background**, 1024 × 1024.
4. Reject and regenerate anything with distorted hands or faces, extra fingers, warped text, fake logos, or brand colours that drift.

## Brand rules for every image

- **Palette (exact):** brand teal `#00897B`, deep teal `#00695C`, green `#43A047`, charcoal `#111827`, background mint-white `#F5FAF9`, white. Accents only: amber `#F59E0B`; coral `#EF4444` only for error illustrations.
- **Uniform:** Nestovin staff wear a neat **teal polo shirt (#00897B)** with a **small plain white house-shaped emblem** on the left chest (no lettering), dark navy or charcoal trousers, clean shoes, hair tied back, a small ID card on a teal lanyard. Same uniform in every photo.
- **People:** real Indian people of varied ages and skin tones; dignified, respectful, never servile; candid moments, not stock poses. Workers are professionals.
- **Homes:** modern mid-range Indian apartments in gated communities (Bengaluru, Pune, Hyderabad feel), clean and lived-in, not luxury, not cluttered.
- **Never:** text, letters, numbers, logos, watermarks, UI screenshots, brand names, religious symbols as decoration, children's faces in close-up.

## Universal prefixes

Paste the prefix first, then the image's own prompt, then the negative prompt.

**Photo prefix**
> Photorealistic editorial lifestyle photograph, shot on a full-frame camera with a 35mm lens at f/2.8, soft natural daylight from a window, gentle shadows, true-to-life skin tones, subtle film-like grain, calm premium mood. Setting: a modern, tidy, mid-range Indian apartment in a gated residential community, white walls, light warm wood, a few green plants, soft textiles. Colour palette restrained to white, warm wood, mint and teal #00897B accents. Domestic staff wear the Nestovin uniform: a neat teal polo shirt with a small plain white house-shaped emblem on the left chest, dark charcoal trousers, ID card on a teal lanyard, hair neatly tied. Candid and dignified, never posed stock photography.

**Illustration prefix**
> Soft 3D clay-style illustration of a single centred object, rounded friendly forms, matte finish with subtle surface texture, gentle top-left studio light and one soft contact shadow below. Strict palette: teal #00897B, deep teal #00695C, green #43A047, mint #E6F4F1, white, with at most one small warm amber #F59E0B highlight. Minimal detail, calm and premium, generous empty space around the object. Transparent background, square 1:1 composition.

**Negative prompt (all images)**
> text, letters, numbers, words, logo, watermark, signature, brand names, UI, screenshot, extra fingers, deformed hands, distorted face, crossed eyes, plastic skin, oversaturated, HDR halos, purple or blue colour cast, neon, luxury mansion, cluttered room, dirty surfaces, servile pose, stock-photo grin, children's faces, religious symbols

**Tool settings (if your tool supports them)**
Midjourney: add `--style raw --stylize 100` and the aspect ratio shown (`--ar 3:4`). DALL·E / Imagen / Firefly: state the aspect ratio in words and paste the negative prompt as "Avoid: …".

---

## 1. Shared photos (used by both apps)

| File | Size / aspect | Where it appears | Prompt (after the photo prefix) |
|---|---|---|---|
| `svc-maid.jpg` | 1200 × 900 (4:3) | Resident home service card and plan header; Worker visit banner | A Nestovin housekeeper in her late 30s wiping a glass dining table in a sunlit apartment, microfibre cloth in hand, a neat stack of folded napkins and a potted plant nearby. Three-quarter view, she is focused and quietly cheerful. Subject on the right two-thirds, soft empty wall top-left. Morning light from the left. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\svc-maid.jpg` |
| `svc-cook.jpg` | 1200 × 900 (4:3) | Resident home service card and plan header; Worker visit banner | A Nestovin cook in her early 40s stirring a pot of yellow dal on a modern Indian kitchen hob, chopped coriander, tomatoes and small steel spice bowls arranged neatly on a light quartz counter, gentle steam rising. Over-the-shoulder angle that shows her calm expression. Warm window light. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\svc-cook.jpg` |
| `svc-caretaker.jpg` | 1200 × 900 (4:3) | Resident home service card and plan header; Worker visit banner | A Nestovin caretaker, an Indian man in his early 30s, seated beside an elderly Indian woman on a soft sofa, helping her read a large-print book; both smiling gently. Warm afternoon light, a cup of tea on a side table. Eye-level, intimate but respectful. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\svc-caretaker.jpg` |
| `community-towers.jpg` | 1800 × 900 (2:1) | Resident community card, household; Worker (reserved) | Exterior of a modern Indian gated residential community at golden hour: three to four mid-rise towers (12–16 floors) with balconies, a landscaped central garden with a curving walking path, trees and a small clubhouse. People tiny and distant only. Clear warm sky, long soft shadows. Wide, slightly elevated angle. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\community-towers.jpg` |
| `ill-verify-review.png` | 1024 × 1024 | Resident verification pending; Worker readiness | (illustration prefix) A document sheet with a folded corner and a round teal clock badge on its lower right. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\ill-verify-review.png` |
| `ill-verified.png` | 1024 × 1024 | Resident verified state | (illustration prefix) A small two-storey house with a green #43A047 shield and white check mark standing in front of it. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\ill-verified.png` |
| `ill-rejected.png` | 1024 × 1024 | Both apps, rejected states | (illustration prefix, swap amber for coral #EF4444) A document sheet with a soft coral circle badge holding a white X. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\ill-rejected.png` |
| `ill-offline.png` | 1024 × 1024 | Both apps, offline errors | (illustration prefix) A soft cloud with a small unplugged cable dangling below it. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\ill-offline.png` |
| `ill-empty-visits.png` | 1024 × 1024 | Both apps, no visits | (illustration prefix) An empty desk calendar page beside a small potted plant. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\ill-empty-visits.png` |
| `ill-checkin-phone.png` | 1024 × 1024 | Resident check-in code; Worker camera permission | (illustration prefix) A smartphone showing a simple abstract square pattern (no real QR code), a small teal location pin floating beside it. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\ill-checkin-phone.png` |
| `ill-visit-done.png` | 1024 × 1024 | Both apps, visit completed / all done | (illustration prefix) A clipboard with three ticked checklist rows and a small amber star. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\ill-visit-done.png` |

## 2. Resident app

### Welcome and sign-in

| File | Size / aspect | Where | Prompt (after the photo prefix) |
|---|---|---|---|
| `onb-verified-staff.jpg` | 1080 × 1350 (4:5) | Welcome step 1, "Verified, managed staff" | At the front door of an apartment, a Nestovin housekeeper in uniform greets a smiling Indian woman in her 30s who holds the door open; the worker's ID card is visible on her lanyard. Doorway framing, warm hallway light, the resident's home softly visible behind. Leave calm space in the top third. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\onb-verified-staff.jpg` |
| `onb-book-services.jpg` | 1080 × 1350 (4:5) | Welcome step 2, "Maid, cook or caretaker for your flat" | A Nestovin cook in a bright home kitchen arranging a fresh breakfast thali (idli, chutney, sliced fruit) on the counter while morning sun streams in. Medium shot, the kitchen feels homely and organised. Calm space in the top third. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\onb-book-services.jpg` |
| `onb-track-visits.jpg` | 1080 × 1350 (4:5) | Welcome step 3, "Track visits and get support" | An Indian woman in her early 30s sitting on a sofa with coffee, glancing at her phone and smiling (the screen faces away, not visible); in the soft background a Nestovin housekeeper tidies the room. Relaxed Sunday-morning mood. Calm space in the top third. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\onb-track-visits.jpg` |
| `res-onboarding-hero.jpg` | 1080 × 1440 (3:4) | Sign-in hero, new-user home | A young Indian couple relaxing with morning coffee in a bright, tidy living room while, in the background, a Nestovin housekeeper smiles as she finishes folding laundry. Wide-ish medium shot, plenty of calm space at the top for a headline. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\res-onboarding-hero.jpg` |
| `res-home-hero.jpg` | 1600 × 900 (16:9) | Reserved (home banner) | A Nestovin cook plating fresh home-style breakfast on a clean kitchen counter, steam rising, sunlight from a side window. Subject on the right third, calm empty wall on the left. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\res-home-hero.jpg` |

### Registration steps

| File | Size | Where | Prompt (after the illustration prefix) |
|---|---|---|---|
| `reg-step-flat.png` | 1024 × 1024 | Register: choose tower and flat | A small apartment tower with one window glowing teal and a location pin above it. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\reg-step-flat.png` |
| `reg-step-occupancy.png` | 1024 × 1024 | Register: owner or tenant | A house key on a ring next to a small rental tag shape (no text), owner and tenant side by side. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\reg-step-occupancy.png` |
| `reg-step-proof.png` | 1024 × 1024 | Register: upload proof | A document sheet with a small teal shield badge, private proof of residence. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\reg-step-proof.png` |

### People (avatars and demo content)

| File | Size | Where | Prompt (after the photo prefix) |
|---|---|---|---|
| `worker-lakshmi.jpg` | 800 × 800 (1:1) | Assigned worker avatar | Head-and-shoulders portrait of a Nestovin cook, Indian woman in her mid 30s, warm natural smile, uniform polo, plain soft mint (#E6F4F1) backdrop, soft even light, eyes to camera. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\worker-lakshmi.jpg` |
| `worker-meena.jpg` | 800 × 800 (1:1) | Assigned worker avatar | Head-and-shoulders portrait of a Nestovin housekeeper, Indian woman in her mid 40s, kind expression, uniform polo, plain soft mint backdrop, soft even light. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\worker-meena.jpg` |
| `worker-ravi.jpg` | 800 × 800 (1:1) | Assigned worker avatar | Head-and-shoulders portrait of a Nestovin caretaker, Indian man in his early 30s, calm friendly smile, uniform polo, plain soft mint backdrop, soft even light. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\worker-ravi.jpg` |
| `resident-ananya.jpg` | 800 × 800 (1:1) | Demo resident profile | Head-and-shoulders portrait of an Indian woman in her early 30s in casual home clothes, natural smile, soft warm-neutral backdrop, soft even light. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\resident-ananya.jpg` |

### State illustrations

| File | Where | Prompt (after the illustration prefix) |
|---|---|---|
| `ill-payment-success.png` | Payment result | A wallet with a teal card peeking out and a green check badge, three small sparkles. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\ill-payment-success.png` |
| `ill-round-joined.png` | Joined a demand round | A calendar page with a teal ribbon bookmark and a small clock. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\ill-round-joined.png` |
| `ill-vote.png` | Expansion vote | A ballot box with a card being dropped in, a green check on the card. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\ill-vote.png` |
| `ill-not-live.png` | Community not live yet | A small residential tower with light scaffolding and a tiny crane, being prepared. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\ill-not-live.png` |
| `ill-empty-support.png` | No support requests | Two overlapping speech bubbles, one teal, one mint, with three small dots. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\ill-empty-support.png` |

## 3. Worker app

| File | Size / aspect | Where | Prompt (after the photo prefix) |
|---|---|---|---|
| `wrk-onboarding-hero.jpg` | 1080 × 1440 (3:4) | Welcome | A Nestovin worker, Indian woman in her early 30s in uniform with a small work bag on her shoulder, walking confidently along the garden path of a gated community towards a residential tower, morning light, slight smile. Plenty of calm sky/space at the top. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\wrk-onboarding-hero.jpg` |
| `wrk-team.jpg` | 1600 × 900 (16:9) | Reserved (team / about) | Three Nestovin staff (two women, one man, different ages) in uniform standing together in a community courtyard, relaxed and proud, natural smiles, soft late-morning light. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\wrk-team.jpg` |
| `wrk-training-1.jpg` | 1200 × 675 (16:9) | Training video cover 1 | A Nestovin trainer showing a housekeeper how to fold bed linen with crisp corners in a bright, simple training room. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\wrk-training-1.jpg` |
| `wrk-training-2.jpg` | 1200 × 675 (16:9) | Training video cover 2 | A Nestovin cook in an apron washing hands thoroughly at a clean steel sink, soap lather visible, kitchen-hygiene lesson. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\wrk-training-2.jpg` |
| `wrk-training-3.jpg` | 1200 × 675 (16:9) | Training video cover 3 | A Nestovin caretaker practising helping an elderly person stand up from a chair safely while a trainer guides, supportive body language. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\wrk-training-3.jpg` |

| File | Where | Prompt (after the illustration prefix) |
|---|---|---|
| `ill-overtime.png` | Offers header / empty | A round clock with a small plus badge and a single coin. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\ill-overtime.png` |
| `ill-leave.png` | Leave header / empty | A calendar page with a small beach umbrella, relaxed. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\ill-leave.png` |
| `ill-payslip.png` | Payslips empty | A receipt slip with a rupee coin (₹ shape on the coin only) beside it. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\ill-payslip.png` |
| `ill-training.png` | Training / not-ready card | A small screen with a play button and a graduation cap resting on top. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\ill-training.png` |
| `ill-applicant.png` | Apply header | A clipboard form with a pen and a friendly green check badge. **Save as:** `D:\Karthik\Karthik\Projects\Nestovin\docs\Design\images\ill-applicant.png` |

## 4. Order of work

Start with these ten; they cover the first screens everyone sees:
`onb-verified-staff`, `onb-book-services`, `onb-track-visits`, `wrk-onboarding-hero`, `svc-maid`, `svc-cook`, `svc-caretaker`, `community-towers`, `ill-empty-visits`, `ill-visit-done`.

## 5. Consistency checklist before you send them

- Same uniform colour and emblem in every photo; no lettering on clothes.
- Same light quality (soft daylight) and palette across the set; no cold blue or purple casts.
- Faces natural; hands correct; no text anywhere.
- Illustrations share one light direction (top-left), one shadow style, transparent background.
