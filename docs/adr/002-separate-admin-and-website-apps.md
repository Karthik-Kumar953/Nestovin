# ADR-002: Admin dashboard and Public Website in one Next.js app

**Status:** Accepted (owner, 20 Nov 2026). Supersedes the earlier version of this ADR, which kept the PRD's React + Vite admin.

## Context
- PRD v1.1 §15.1 specifies React + Vite for the Admin Portal and Next.js for the website.
- The owner confirmed the deliverables as:
  1. Resident app (React Native + TS)
  2. Worker app (React Native + TS)
  3. Admin dashboard (Next.js)
  4. Public website (Next.js)
  5. Shared backend (Node + Express)
- Items 3 and 4 live in **one Next.js app**.

## Decision
- `apps/web` is a single Next.js (App Router) application:
  - `/`: public website (informational + enquiry form; no booking). Built after its design pass (Phase 1b).
  - `/admin`: Unified Admin Portal. Client-rendered pages behind Supabase sign-in + mandatory TOTP MFA.
- **The Express API remains the only security boundary.** Next.js middleware, route guards and hidden navigation are UX only. The Next.js app holds no secrets and never talks to the database; its only server-side logic is the dev proxy to the API.
- Shared packages: `@nestovin/contracts`, `@nestovin/design-tokens`.

## Mitigations for sharing one deployment
- `/admin` responses send `X-Robots-Tag: noindex` and a strict `frame-ancestors 'none'` policy. Security headers apply site-wide.
- Admin code sits in its own route segment, so public visitors never download admin bundles.
- No admin data is server-rendered. Admin pages fetch from the API with the user's token, so a misconfigured page cannot leak data at build time.

## Consequences
One web deployment and one framework for both web surfaces, with a shared design system. The public site and the admin share an origin, so the CSP and headers must cover both.
