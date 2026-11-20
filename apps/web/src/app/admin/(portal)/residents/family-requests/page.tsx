'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { FamilyRequestsPage } from '@/admin/pages/residents/FamilyRequestsPage';

export default function Page() {
  return (
    <RequirePermission module="family_requests">
      <FamilyRequestsPage />
    </RequirePermission>
  );
}
