import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminRoot } from '@/admin/AdminRoot';
import '@/admin/admin.css';

export const metadata: Metadata = {
  title: { absolute: 'Nestovin Admin', template: '%s · Nestovin Admin' },
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/** /admin: Unified Admin Portal. All data comes from the Express API, which authorises every request. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminRoot>{children}</AdminRoot>;
}
