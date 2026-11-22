import type { NextConfig } from 'next';

/**
 * TEMPORARY launch build of the public website: a fully static export (`out/`)
 * that any static host can serve. No server, no API calls, no admin portal.
 * Security headers live in public/_headers (Cloudflare Pages / Netlify) and
 * vercel.json (Vercel), because `output: 'export'` cannot set headers itself.
 */
const nextConfig: NextConfig = {
  output: 'export',
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  transpilePackages: ['@nestovin/design-tokens'],
};

export default nextConfig;
