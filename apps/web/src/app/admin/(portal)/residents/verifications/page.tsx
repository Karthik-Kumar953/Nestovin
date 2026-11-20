'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { VerificationsPage } from '@/admin/pages/residents/VerificationsPage';

export default function Page() {
  return (
    <RequirePermission module="residents">
      <VerificationsPage />
    </RequirePermission>
  );
}
