import type { ReactNode } from 'react';
import './site.css';

/**
 * Public website shell. Tailwind CSS (site.css) loads only for these routes;
 * the admin portal under /admin keeps its own stylesheet.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-canvas text-ink">{children}</div>;
}
