import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Security headers for the whole site. The public site and /admin share one
 * origin (ADR-002), so the policy must cover both. The Express API remains the
 * only security boundary for data.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
const connectSrc = ["'self'", supabaseUrl, apiUrl, supabaseUrl.replace(/^http/, 'ws')].filter(Boolean).join(' ');

const csp = [
  "default-src 'self'",
  // Next.js needs inline scripts for hydration; dev also needs eval for fast refresh.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src ${connectSrc}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'X-Frame-Options', value: 'DENY' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@nestovin/contracts', '@nestovin/design-tokens'],
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        source: '/admin/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      { source: '/admin', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
    ];
  },
  // Development only: same-origin /v1 calls are forwarded to the local Express API.
  async rewrites() {
    if (!isDev || apiUrl) return [];
    return [{ source: '/v1/:path*', destination: 'http://localhost:4000/v1/:path*' }];
  },
};

export default nextConfig;
