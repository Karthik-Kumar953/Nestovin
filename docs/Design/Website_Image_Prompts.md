# Website: hero film and photo prompts

The website already works without these. Every section is designed with animated SVG, so nothing looks empty. The media below makes it richer. Generate them and save them in `apps/web/public/site/` with the exact file names. Each one is wired up through `apps/web/src/site/images.ts`.

## Shared style (paste before every prompt)

> Photorealistic, cinematic, warm natural light, modern Indian gated residential community, calm and premium but not luxury, real lived-in homes. Soft depth of field, gentle film grain, colour palette of white, warm wood, soft mint and teal (#00897B) accents with a touch of evening amber. Nestovin staff wear a neat teal polo with a small white house-shaped emblem on the chest, dark trousers, hair tied back, friendly and professional. Candid, dignified, never posed stock photography. No text, no logos, no watermark. Keep the subject away from the edges listed under "text-safe area".

## 1. Hero film (optional, strongest single upgrade)

| | |
|---|---|
| File | `hero-loop.mp4` (H.264, 1920×1080, 8–12 s seamless loop, under 6 MB, no audio) plus `hero-loop-poster.jpg` (the first frame) |
| Used in | Home hero, behind the illustrated community, at low opacity on desktop only. On mobile and with reduced motion, only the still poster or nothing is shown. |
| Concept | "A day in a cared-for home, in one breath." A slow dolly from a gated community's garden path at golden hour toward a tower entrance. Cut to the inside of a bright apartment: a Nestovin cook sets down a steaming bowl, and a housekeeper straightens cushions in the background. The last frame is close to the first, so it loops. |
| Camera | Gimbal, very slow push-in, 24 fps, shallow depth of field, no fast cuts (cross-dissolves only). |
| Text-safe area | Left 45% of the frame stays calm and soft (wall, sky, blurred garden). The headline sits there. |

## 2. Photos

| File | Size | Where it appears | Prompt (after the shared style) | Text-safe area |
|---|---|---|---|---|
| `community-towers.jpg` | 2400×1200 | For communities band and About page | Exterior of a modern Indian gated community at golden hour: 3–4 mid-rise towers with balconies, landscaped garden, walking path and trees, a few residents walking far away. | Top 35% (sky) |
| `svc-maid.jpg` | 1600×1200 | Maid service page and stacked service card | A Nestovin housekeeper wiping a glass dining table in a sunlit apartment, plants and soft cushions nearby, focused and cheerful, three-quarter view. | Left third |
| `svc-cook.jpg` | 1600×1200 | Cook service page and stacked service card | A Nestovin cook stirring a pot of dal on a modern Indian kitchen stove, fresh vegetables and spices arranged neatly, steam visible in the light. | Left third |
| `svc-caretaker.jpg` | 1600×1200 | Caretaker page and stacked service card | A Nestovin caretaker sitting beside an elderly Indian woman on a sofa, reading a book together, both smiling gently. | Left third |
| `wrk-team.jpg` | 2000×1125 | Careers page and About page | Three Nestovin staff (two women, one man) in teal polos standing together in a community courtyard, relaxed and proud, natural expressions. | Right third |
| `about-hands.jpg` | 1600×1600 | About page, beside "What we believe" | Close-up of hands folding a crisp white towel on a wooden surface, soft window light, calm and tactile. | None needed |
| `og-image.jpg` | 1200×630 | Social sharing preview (Open Graph) | A wide shot of a bright, calm living room with a Nestovin team member in the soft background; plenty of clean space on the left. | Left 55% (the logo and headline are added in code) |

## 3. Illustrations

None needed. All site illustrations are hand-built animated SVG in the brand style.

## 4. After generating

1. Put the files in `apps/web/public/site/`.
2. Tell the lead. The lead wires each one in (one line per image in `src/site/images.ts`) and checks contrast and load size.
