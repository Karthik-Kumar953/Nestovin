import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { site } from '@/site/content';
import { Footer } from '@/site/Footer';
import { Header } from '@/site/Header';
import { Reveals } from '@/site/Reveals';
import './site.css';

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: 'Nestovin: home help, organised for your whole community', template: '%s · Nestovin' },
  description: site.description,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Nestovin',
    locale: 'en_IN',
    title: 'Nestovin: home help, organised for your whole community',
    description: site.description,
    images: [{ url: '/site/community-dawn.jpg', width: 2752, height: 1536, alt: 'A gated residential community at golden hour' }],
  },
  twitter: { card: 'summary_large_image' },
};

/** Public website shell. Tailwind (site.css) loads only for these routes. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <a href="#main" className="sr-only z-50 rounded-md bg-teal px-4 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <Header />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
      <Reveals />
    </div>
  );
}
