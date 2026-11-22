import type { MetadataRoute } from 'next';
export const dynamic = 'force-static';
import { services, site } from '@/site/content';

/** Public website pages only; the admin portal is never listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ['', '/services', '/how-it-works', '/trust', '/communities', '/careers', '/about', '/faq', '/contact', '/privacy', '/terms'];
  const now = new Date();
  return [
    ...pages.map((p) => ({ url: `${site.url}${p}`, lastModified: now, changeFrequency: 'monthly' as const, priority: p === '' ? 1 : 0.7 })),
    ...services.map((s) => ({ url: `${site.url}/services/${s.slug}`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.8 })),
  ];
}
