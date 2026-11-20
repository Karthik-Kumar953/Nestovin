'use client';

import type { ReactNode } from 'react';
import { RequireSession } from '@/admin/AdminRoot';
import { Layout } from '@/admin/components/Layout';

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <RequireSession>
      <Layout>{children}</Layout>
    </RequireSession>
  );
}
