'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { TicketsPage } from '@/admin/pages/support/TicketsPage';

export default function Page() {
  return (
    <RequirePermission module="support">
      <TicketsPage />
    </RequirePermission>
  );
}
