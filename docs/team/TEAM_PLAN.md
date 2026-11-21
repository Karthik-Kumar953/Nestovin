# Nestovin build team: roles, ownership and rules

Started 21 Nov 2026. Goal: the Resident app, the Worker app, the Admin portal (`apps/web`, `/admin`) and the API working end to end at production quality, demo-ready and good-looking. Visual polish from the owner's generated images comes in a later pass. The public website is last.

## Roles
| Role | Session | Branch (own worktree) | Owns (may edit) |
|---|---|---|---|
| Team lead | the lead session (started all others) | `gaps-before-apps`, then merges | `apps/api/**`, `packages/contracts/**`, `supabase/migrations/**`, `docs/adr/**`, merges |
| Resident app | resident-app | its own | `apps/resident/**`, `packages/ui-native/**` (shared RN building blocks, created by this session) |
| Worker app | worker-app | its own | `apps/employee/**` (new) |
| Testing | qa | its own | `**/*.test.ts(x)`, `apps/*/e2e/**`, `apps/*/.maestro/**`, `playwright.config.*`, `docs/testing/**` |
| Architecture review | review | its own | `docs/reviews/**` only (read-only for code) |
| Admin portal | admin-portal | its own | `apps/web/src/admin/**`, `apps/web/src/app/admin/**` |
| Public website | website | its own | `apps/web/src/app/(public)/**`, `apps/web/src/site/**`, `apps/web/public/site/**` |

Shared web files (`apps/web/package.json`, `next.config.ts`, the root layout, global CSS, Tailwind config):
- Both web sessions may add dependencies and the minimum shared config they need.
- Say so in the commit message.
- The lead resolves merge conflicts.

Notes on the table:
- **Worker app and `packages/ui-native`:** the Worker app consumes `packages/ui-native` but does not edit it. It asks the resident-app session for changes through the lead. Until a building block exists there, it keeps a local copy under `apps/employee/src/ui/` and swaps to the shared one later.
- **Testing and application code:** the testing session never edits application code. It reports bugs to the lead with the failing test.

## Rules
1. **Nobody but the lead changes the API, contracts or migrations.**
   - Need an endpoint or a field? Message the lead with the exact shape: route, request, response, and the screen that needs it.
   - While you wait, code against a typed stub in your app (marked `// TODO(api): …`) so you are not blocked.
2. **Source of truth for behaviour:**
   - `docs/Architecture/Nestovin_Individual_Module_Workflows_v1.0_Final.md`, then the ADRs, then the PRD.
   - The owner's decisions in ADRs 012–017 override the PRD.
   - Don't invent business rules, prices, plan names or policies. If something is ambiguous, ask the lead, who asks the owner.
3. **Design:**
   - Tokens, copy rules and guardrails: `docs/Design/DESIGN.md`, `docs/Design/Mobile_Design_System.md`.
   - Flows and states: the Resident canvas https://claude.ai/artifact/CLKL7mn846ew6mVX4so8eE. It is a flow reference, not a visual reference; its look was rejected as too plain.
   - The bar is premium and demo-worthy. Take inspiration from category leaders (Urban Company, Pronto, Snabbit) without copying them.
   - Use the `ui-ux-pro-max` and `ui-styling` skills in `.claude/skills/`.
4. **Images:**
   - The owner is generating them from `docs/Design/Image_Shot_List.md` into `docs/Design/images/`.
   - Reference every image by its shot-list file name through one image registry per app (e.g. `src/assets/images.ts`).
   - When a file is missing, show a designed fallback (brand gradient plus icon or illustration), never a broken image or an empty grey box.
5. **Mobile stack:**
   - Expo SDK 58, expo-router, TypeScript strict.
   - NativeWind for styling, with the Nestovin tokens as the Tailwind theme. Verify the NativeWind version that supports Expo SDK 58 / RN 0.88 before installing, and record it in `docs/adr/018-mobile-styling-and-motion.md` (the lead writes the ADR from your note).
   - Data and forms: TanStack Query, Zod (from `@nestovin/contracts`), react-hook-form.
   - Lists and media: FlashList, expo-image, expo-camera (QR).
   - Motion: Reanimated 4, plus Moti and Lottie where they add value. Framer Motion and GSAP are web-only; they belong to the admin and website.
   - Platform: Liquid Glass via `expo-router/native-tabs` and `expo-glass-effect` on iOS 26 only; Material 3 on Android; respect Reduce Motion and Reduce Transparency.
6. **Quality bar** (each PR-sized change must pass before you call it done):
   - `tsc --noEmit`, ESLint, unit tests, and `npx expo-doctor` for the apps
   - `npx expo export --platform android` bundles successfully
   - loading, empty, error, offline and permission-denied states designed
   - accessibility labels and roles on every interactive element
   - no secrets in code or logs
7. **Secrets and env:**
   - Each worktree needs the git-ignored env files copied from the main checkout `D:\Karthik\Karthik\Projects\Nestovin`: `apps/api/.env`, `apps/web/.env.local`, `apps/resident/.env`.
   - Copy them with a file copy. **Never print, log, commit or modify their values.**
   - The Supabase service-role key and DB password are secrets. The publishable key and URL are public.
8. **Tooling quirks (Windows):**
   - pnpm is not on PATH. Use `corepack pnpm`; run `corepack pnpm install` once in your worktree.
   - Expo commands that call pnpm need a shim folder containing `pnpm` and `pnpm.cmd` that run `corepack pnpm %*`, prepended to PATH as a POSIX path (`/c/...`).
   - In bash, prefer writing small `.cjs` scripts to a temp folder over complex heredocs.
   - Vitest on Windows sometimes crashes a worker (exit 3221226505). Rerun once before treating it as a failure.
9. **Database:**
   - Only the lead runs migrations against the shared dev Supabase project.
   - Integration tests may read and write test data there, but must scope data to their own fixtures and clean up.
10. **Git:**
    - Commit small, meaningful commits on your own branch, with messages that explain why.
    - Never push, never merge, never rewrite history, and never touch another session's branch.
    - End each commit message with the co-author line the system gives you.
11. **Reporting:** when you finish a milestone, end your turn with a short report:
    - what works
    - how you verified it (commands and results)
    - what is stubbed or waiting on the API
    - your branch name

## Skills to use (installed 21 Nov 2026)
| Area | Skill |
|---|---|
| Project, in `.claude/skills/` | `ui-ux-pro-max`, `ui-styling`, `database-architect` |
| User, in `~/.claude/skills/` | `vercel-react-native-skills` (mobile apps), `vercel-react-best-practices` and `vercel-composition-patterns` (admin and shared React), `vercel-react-view-transitions` (admin and website motion), `find-skills` (to look for more) |
| User plugins | `supabase` and `postgres-best-practices` (Supabase's official skills) |
| MCP | read-only Supabase MCP for the dev project (`supabase`), once the owner signs in |

Read a skill's `SKILL.md` before relying on it. Skills marked third-party were reviewed by the lead before install.

## Milestones
- **M1 (foundations):**
  - NativeWind and tokens, shared building blocks, image registry, motion primitives
  - Worker app scaffold and sign-in
  - test harness: Playwright config, Maestro flows skeleton
  - review report v1
- **M2 (flows):**
  - every Resident and Worker flow working against the real API
  - Playwright web flows for admin plus app web builds
- **M3 (hardening):**
  - review findings fixed
  - full test pass
  - demo script
  - UAT checklist
