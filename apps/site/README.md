# Nestovin public website (temporary launch app)

The public website, built as a **fully static** Next.js export so it can go live before the
backend and admin portal. The long-term home is `apps/web` (website at `/`, admin at `/admin`).

## Run and build

```
corepack pnpm --filter @nestovin/site dev      # http://localhost:3100
corepack pnpm --filter @nestovin/site build    # static site in apps/site/out
```

Deploy the `out/` folder to any static host. Security headers: `public/_headers`
(Cloudflare Pages, Netlify) or `vercel.json` (Vercel). Build settings on a host:
root `apps/site`, build `corepack pnpm build`, output `out`.

## Environment

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical URL, default `https://www.nestovin.com` |
| `NEXT_PUBLIC_WEB3FORMS_KEY` | Web3Forms access key (from web3forms.com, tied to the inbox that receives enquiries). When set, enquiries are emailed there. Public by design, but set it in the host's environment variables rather than committing it. |
| `NEXT_PUBLIC_ENQUIRY_ENDPOINT` | Where the enquiry form POSTs JSON. Used only when the Web3Forms key is not set. Neither set = the page says enquiries open soon. |

## Media

Prompts for every photo and the hero film: `docs/Design/Website_Image_Prompts.md`.
Drop files into `public/site/` with the names listed there. For the hero film, set
`heroFilm.mp4` (and `webm`) in `src/site/content.ts`.

## Folding back into apps/web

The folder layout mirrors `apps/web` on purpose:

1. Copy `src/app/(public)/`, `src/site/`, `src/app/not-found.tsx`, `robots.ts`, `sitemap.ts`
   and `public/site/` into `apps/web`.
2. Point the enquiry form back at `${NEXT_PUBLIC_API_URL}/v1/public/enquiries`.
3. Remove `export const dynamic = 'force-static'` from robots/sitemap if not needed, delete `apps/site`.
