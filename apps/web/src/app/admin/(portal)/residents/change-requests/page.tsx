'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { ChangeRequestsPage } from '@/admin/pages/residents/ChangeRequestsPage';

export default function Page() {
  return (
    <RequirePermission module="residents">
      <ChangeRequestsPage />
    </RequirePermission>
  );
}
