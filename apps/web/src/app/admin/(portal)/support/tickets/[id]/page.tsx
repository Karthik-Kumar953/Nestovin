'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { TicketDetailPage } from '@/admin/pages/support/TicketDetailPage';

export default function Page() {
  return (
    <RequirePermission module="support">
      <TicketDetailPage />
    </RequirePermission>
  );
}
