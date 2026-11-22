# Nestovin website: master prompts for images and film

**Owner:** the client team generates every asset; the code team places them.
**Tool:** Google Flow (Nano Banana for stills, Veo for film). The prompts also work in Midjourney, Imagen or Runway with small changes.
**Updated:** 22 Nov 2026. This file replaces the earlier image list.

The home page opens on **your film (Film A) as the hero**, behind the headline. Directly under it, the scroll-driven drawn community (built in code) explains how Nestovin works. Until the film is ready, the hero shows `community-dawn.jpg`.

---

## 1. Why the last batch felt wrong, and the rules that fix it

The last photos looked like AI stock: glossy skin, perfect symmetry, people smiling at nothing, and logos and text that came out slightly broken. These rules fix that. Read them once before you generate anything.

1. **Shoot it like a documentary, not an ad.** Every prompt names a real camera, lens, aperture and light source. Real photographers' language gets real-looking pictures.
2. **People are busy, not posing.** Nobody looks at the camera unless the shot says so. Hands are doing something specific.
3. **Real skin and real homes.** Ask for visible skin texture, flyaway hair, slightly worn steel utensils, a phone charger on the counter. A little imperfection reads as real.
4. **No text, no logos, no numbers in the image.** AI spells these wrongly. The uniform carries a *plain* white embroidered house shape only. Door numbers, app screens and the Nestovin logo are added by the code team or in edit.
5. **One light source, named.** "Soft morning window light from the left" beats "well lit".
6. **Leave room for words.** Each shot states which side stays calm so headlines can sit on it.
7. **Same people every time.** Generate the three character sheets in section 3 first, then add them as **Ingredients** to every later prompt that shows that person.
8. **Pick the best of four, then upscale to 2K.** Reject any image with extra fingers, melted utensils, warped door frames, or text-like marks.

### Negative prompt (paste into every still and every film shot)

> no text, no letters, no numbers, no watermark, no logo text, no brand names, no signage, no stock-photo smile, no looking at camera, no glamour retouching, no plastic skin, no HDR, no oversaturation, no lens flare, no fisheye distortion, no extra fingers, no deformed hands, no warped architecture, no luxury mansion, no Western kitchen props, no cartoon, no 3D render look

---

## 2. Shared visual world (applies to every asset)

- **Place:** a modern, mid-range Indian gated community. Clean white or warm-grey mid-rise towers, landscaped paths, security gate. Inside: real lived-in 2 and 3 BHK flats with white quartz or granite counters, light oak cabinets, steel utensils, a pressure cooker, potted tulsi or money plant, cotton curtains.
- **People:** Indian, ordinary and dignified. Residents are working professionals, young families and elderly parents. Staff are neat, calm and competent.
- **Palette (from DESIGN.md, nothing else):**
  - Deep teal `#00897B` / `#00796B` is the uniform and accent colour.
  - Fresh green `#43A047` appears only in plants and small accents.
  - Mint-white `#F5FAF9` and white walls make up most of the frame.
  - Charcoal `#111827` is used only for deep shadows.
  - Warm sunlight is the only warm colour.
- **Grade:** clean whites, lifted gentle shadows, warm highlights, slightly cool shadows, fine film grain (Kodak Portra 400 feel).
- **Uniforms (Brand Kit p.7):**
  - **Maid:** deep teal `#00897B` short-sleeve tunic with a light mint collar trim, mint apron with two front pockets, teal trousers, small plain white embroidered house shape on the left chest.
  - **Cook:** white chef coat with teal piping and teal buttons, teal apron, white chef cap, black trousers, same small white house shape on the chest.
  - **Caretaker:** light grey polo with teal collar and sleeve trim, teal cap, dark grey cargo trousers, same small house shape on the chest.
  - **Everyone:** a photo ID card on a teal lanyard. The card face stays blurred or turned away, never readable.

---

## 3. Step 1: character sheets (generate first, use as Ingredients)

Generate each one at 1:1, pick the best, and save it as an Ingredient named exactly as below.

### 3a. `char-cook-lakshmi`
> Character reference sheet, photorealistic studio portrait, plain light mint-grey seamless background, soft large softbox key light from the left, 85mm lens f/4. Lakshmi, an Indian woman around 32, warm medium-brown skin with natural texture, neat low bun, small gold stud earrings, calm confident expression. She wears a crisp white chef coat with deep teal (#00897B) piping and teal buttons, a deep teal apron, a white chef cap, black trousers, and a photo ID card on a teal lanyard turned slightly away. Three views side by side: front, three-quarter, profile. Full body visible. Neutral, natural, not smiling widely.

### 3b. `char-maid-priya`
> Character reference sheet, photorealistic studio portrait, plain light mint-grey seamless background, soft large softbox key light from the left, 85mm lens f/4. Priya, an Indian woman around 27, medium skin with natural texture, hair in a neat braid, small black bindi, friendly composed expression. She wears a deep teal (#00897B) short-sleeve tunic with a light mint collar trim, a mint apron with two front pockets, teal trousers, a small plain white embroidered house shape on the left chest, and a photo ID card on a teal lanyard turned slightly away. Three views side by side: front, three-quarter, profile. Full body visible.

### 3c. `char-caretaker-ravi`
> Character reference sheet, photorealistic studio portrait, plain light mint-grey seamless background, soft large softbox key light from the left, 85mm lens f/4. Ravi, an Indian man around 42, medium-dark skin with natural texture, short greying hair, neatly trimmed moustache, gentle patient expression. He wears a light grey polo shirt with a deep teal (#00897B) collar and sleeve trim, a teal cap, dark grey cargo trousers, a small plain white embroidered house shape on the left chest, and a photo ID card on a teal lanyard turned slightly away. Three views side by side: front, three-quarter, profile. Full body visible.

### 3d. Residents (optional, for the film and the door shot)
- `char-resident-ananya`: Indian woman around 35, a working professional in a soft cotton kurta, hair loose to the shoulders, reading glasses pushed up.
- `char-elder-kamala`: Indian woman around 72, silver hair in a bun, cotton saree in muted green, kind eyes.

Use the same studio wording as above.

---

## 4. Step 2: website stills

**Settings:** 16:9, 2K upscale, JPG. For every image marked **+4:5**, also generate a 4:5 vertical crop for mobile.

**File names:** use these exactly and drop the files into `apps/site/public/site/`. The code already expects these names.

| # | File | Where it appears | Ingredients |
|---|---|---|---|
| 1 | `cook.jpg` +4:5 | Home "day" story 07:00, Cook page | char-cook-lakshmi |
| 2 | `maid.jpg` +4:5 | Home "day" story 09:00, Maid page | char-maid-priya |
| 3 | `caretaker.jpg` +4:5 | Home "day" story 18:00, Caretaker page | char-caretaker-ravi, char-elder-kamala |
| 4 | `door-checkin.jpg` +4:5 | Home day story check-in, Trust hero | char-cook-lakshmi, char-resident-ananya |
| 5 | `team.jpg` | Careers full-screen hero (headline on the left), Trust | all three staff |
| 6 | `community-dawn.jpg` | Home hero until the film is ready, For communities, About | none |
| 7 | `training.jpg` | Careers "how you start" | char-maid-priya |
| 8 | `id-detail.jpg` | Trust "in uniform with a photo ID" | char-caretaker-ravi |
| 9 | `support-desk.jpg` | Contact page | none (new character) |
| 10 | `family-morning.jpg` | About, home closing band | char-resident-ananya, char-elder-kamala |
| 11 | `og-image.jpg` (1200×630) | Link previews on WhatsApp, LinkedIn and X | char-maid-priya, char-cook-lakshmi |

### 1. `cook.jpg`
> Documentary photograph, Canon R5, 50mm lens at f/2, 7 am. A bright Indian apartment kitchen with a white quartz counter, light oak cabinets, a steel pressure cooker and a small brass tulsi pot on the windowsill. Lakshmi, the Nestovin cook in her white chef coat with teal piping, teal apron and white chef cap, stirs a steel pot of yellow dal with a long ladle while steam curls into soft morning window light coming from the right. She looks down at the pot, focused and calm. Fresh coriander and chopped tomatoes on a wooden board in the foreground, slightly out of focus. The left third of the frame is a calm, softly lit white wall for text. Natural skin texture, fine film grain, Kodak Portra 400 colour, clean whites, warm highlights.

### 2. `maid.jpg`
> Documentary photograph, Sony A7 IV, 35mm lens at f/2.2, 9 am. The living and dining room of a lived-in Indian 3 BHK flat: sheer white curtains, light oak floor, a glass-top dining table with six chairs, a money plant in a ceramic pot. Priya, the Nestovin housekeeper in her teal tunic with mint collar and mint apron, wipes the glass table in slow circles with a folded microfibre cloth, a spray bottle beside her hand. She is mid-motion, looking at her work. Soft diffused daylight through the curtains from the left. The right third of the frame is open, calm wall and curtain for text. Natural skin texture, slight motion in the cloth, fine film grain, clean whites and soft mint tones.

### 3. `caretaker.jpg`
> Documentary photograph, Fujifilm X-T5, 33mm lens at f/1.8, 6 pm golden hour. A warm Indian living room with a cane chair, cotton cushions and a framed family photo out of focus on the wall. Ravi, the Nestovin caretaker in his grey polo with teal collar and teal cap, bends slightly to hand a steel tumbler of tea on a saucer to Kamala, an elderly woman in a muted green cotton saree seated in the cane chair. Their hands are close around the cup; she is mid-sentence and he is listening. Low golden sunlight from the window behind and to the left, gentle rim light on both. The left third of the frame is calm and softly lit for text. Tender, respectful, unposed, fine film grain.

### 4. `door-checkin.jpg`
> Documentary photograph, Canon R6, 35mm lens at f/2.8, 7 am, from inside the flat looking out through the open front door. The building corridor has clean off-white walls, a potted plant and soft cool daylight. Ananya, the resident in a cotton kurta, holds her phone screen toward Lakshmi, the Nestovin cook standing in the corridor in her white chef coat, teal apron and chef cap with an ID card on a teal lanyard. Lakshmi holds her own phone, about to tap it. The phone screens are bright but show no readable text. Both are slightly smiling in a natural, everyday way. The door frame forms a natural border on the right, and the left third is the calm hallway wall for text. Fine film grain, natural skin.

### 5. `team.jpg`
> Documentary group photograph, Sony A7 IV, 50mm lens at f/2.8, 8 am. A landscaped courtyard of an Indian gated community with white mid-rise towers softly out of focus behind and neem trees casting dappled shade. Priya (maid, teal tunic and mint apron), Lakshmi (cook, white chef coat, teal apron, chef cap) and Ravi (caretaker, grey polo, teal cap) walk together toward the camera along a paved path, mid-conversation, each with an ID card on a teal lanyard. Natural relaxed body language, not lined up. Morning light from behind with soft rim light. The top third of the frame is sky and building for text. Fine film grain, clean whites, fresh greens.

### 6. `community-dawn.jpg`
> Architectural photograph, 24mm tilt-shift lens at f/8, 6:15 am. A modern Indian gated community at dawn: four white mid-rise residential towers with glass balconies, a few windows warmly lit, a landscaped central garden with a walking path, a security gate in the foreground right, a few early walkers far away. Soft pink-gold sky fading to pale mint. The top 40% of the frame is calm sky for text. No people close enough to be identified, no signage. Crisp, calm, aspirational but realistic, fine grain.

### 7. `training.jpg`
> Documentary photograph, 35mm lens at f/2.5, mid-morning. A clean, bright training room with a demo kitchen counter. A Nestovin trainer, an Indian woman around 45 in a teal polo with her back three-quarters to the camera, shows three new staff in teal uniforms how to fold a cotton bedsheet neatly. Priya is in the centre, concentrating, hands on the fabric. Soft daylight from large windows on the right. The left third is a calm wall for text. Encouraging, real, unposed, fine film grain.

### 8. `id-detail.jpg`
> Close-up detail photograph, 100mm macro lens at f/2.8. The chest of Ravi, the Nestovin caretaker: grey polo with teal collar, a small plain white embroidered house shape on the chest, and a photo ID card on a teal lanyard angled so its surface catches soft light and shows no readable text. His hand adjusts the lanyard. Shallow depth of field, soft window light from the left, the background a soft mint-white blur. Tactile fabric texture, fine film grain.

### 9. `support-desk.jpg`
> Documentary photograph, 50mm lens at f/2, daytime. A small, bright, modern Nestovin support office: white desk, a monitor seen from behind (screen not visible), a potted plant, teal accent chair. An Indian man around 30 in a teal polo with a slim headset speaks on a call, listening carefully and taking a note by hand in a notebook. Soft daylight from a window on the left. The right 40% of the frame is a calm white wall for text. Warm, reassuring, competent, fine film grain.

### 10. `family-morning.jpg`
> Documentary photograph, 35mm lens at f/2, 8 am. The dining area of an Indian flat: Ananya, a working professional, laughs with her elderly mother Kamala at the breakfast table over idli and chutney in steel plates, while a school bag and laptop bag wait by the chair. In the soft background, out of focus, a Nestovin maid in teal works quietly in the kitchen doorway. Morning window light from the right. The left third is calm for text. Relaxed, genuine, everyday warmth, fine film grain.

### 11. `og-image.jpg` (1200×630)
> Wide documentary photograph for a link preview, 35mm at f/2.8. A bright Indian apartment kitchen: Priya in her teal tunic and mint apron and Lakshmi in her white chef coat and teal apron, side by side at the counter, one rinsing vegetables and one chopping, both relaxed and focused. Morning light from the left. The entire left 45% of the frame is a calm, softly lit plain white wall (the logo and headline go there in edit). No text in the image. Fine film grain.

---

## 5. Step 3: film

There are two films. **Film A** is the home-page hero loop, playing behind the headline. **Film B** is the 30-second brand film for marketing (Instagram, YouTube, WhatsApp status). Both use the same characters and the same world.

**General Veo settings:** 16:9 (Film B also gets a 9:16 version), 1080p if your plan allows, otherwise 720p, 8-second shots, **Frames to Video** mode using the stills above as start frames wherever stated. That keeps faces and uniforms consistent. Generate three or four takes per shot and keep the calmest one.

**Every film prompt ends with:**
> Cinematic, photorealistic, 24fps, natural motion blur, gimbal-stabilised or locked-off camera, slow deliberate movement, shallow depth of field, Kodak Portra 400 colour, clean whites, soft mint and deep teal accents, warm sunlight, fine film grain. No dialogue, no text on screen, no logos, no fast cuts, no camera shake.

### Film A: `hero-film.mp4` (home hero, about 16 s, silent, seamless loop)

This plays full-screen behind the home headline, which sits on the **left 45%** of the frame over a dark gradient. So in every shot keep the left 45% calm (wall, sky, soft background) and put the action on the right. It must work muted and loop without a visible jump.

Add this line to both A1 and A2: *"Keep the left 45% of the frame calm and uncluttered; the subject and action stay in the right half."*

| Shot | Start frame | Prompt |
|---|---|---|
| A1 (8 s) | `community-dawn.jpg` | Very slow forward dolly along the garden path toward the towers as dawn light grows warmer. A few windows light up one by one. Two birds cross the sky. Dew glints on the grass. Calm and still. |
| A2 (8 s) | `cook.jpg` | Locked-off camera with an almost imperceptible push-in. Lakshmi slowly stirs the dal, steam rises and drifts through the window light, she reaches for the coriander and sprinkles it in. Ending pose matches the starting pose so the clip can loop. |

**Edit (code team does this):** cross-dissolve A1 → A2 → back to A1 over 1 second. Export H.264 MP4 (about 3 MB) plus WebM, and a poster frame JPG.

### Film B: "A morning at flat 1204" (30 s brand film, 4 shots)

**Story:** the community wakes up, the cook arrives and checks in at the door, care happens quietly inside the home, and the evening ends with tea. It shows exactly how Nestovin works: a known person, on schedule, checked in, caring for the home.

| Shot | Start frame | Prompt |
|---|---|---|
| B1 Wake (8 s) | `community-dawn.jpg` | Slow aerial-style crane down from above the towers toward the gated entrance at dawn. Windows glow warm. At the gate, Lakshmi, Priya and Ravi in their uniforms walk in together and greet the guard with a nod, seen from mid-distance. |
| B2 Arrive (8 s) | `door-checkin.jpg` | Camera inside the flat, slight slow push toward the door. Ananya opens the door, holds up her phone, Lakshmi taps her own phone and both nod with an easy smile. Lakshmi steps in, slipping her shoes off at the threshold. |
| B3 Care (8 s) | `maid.jpg` | Slow lateral track from right to left across the flat: Priya wiping the glass dining table in soft curtain light, continuing past to the kitchen doorway where Lakshmi, out of focus, plates breakfast. Gentle, unhurried rhythm. |
| B4 Evening (8 s) | `caretaker.jpg` | Golden hour, slow push-in. Ravi hands Kamala a steel tumbler of tea, she takes it with both hands and smiles, he sits on a low stool beside her as she begins telling a story. The light softens. Final second holds still on the calm, warm room. |

**End card (added in edit, not generated):** the Nestovin logo on mint `#F5FAF9`, with the line "Your home. Our priority." and the website address.

**Music and sound (if you add it):** soft acoustic guitar or sitar with light tabla, around 80 bpm. Add ambient sound per scene: morning birds, a pressure-cooker whistle in the distance, a doorbell, a teacup on a saucer.

**9:16 version for Reels:** regenerate each shot at 9:16 with the same prompt plus "vertical framing, subject centred, room above the head for captions".

---

## 6. Handover checklist

- [ ] Character sheets saved as Ingredients (3a, 3b, 3c; 3d if used).
- [ ] 11 stills at 2K, with 4:5 crops where marked, named exactly as in section 4.
- [ ] Film A shots A1 and A2 (home hero, left 45% calm).
- [ ] Film B shots B1–B4 at 16:9 (and 9:16 if wanted).
- [ ] Reject anything with readable text, broken hands, warped doors or an off-palette uniform.
- [ ] Put everything in one folder and share it. The code team crops, compresses to WebP/AVIF, adds alt text and places it.
