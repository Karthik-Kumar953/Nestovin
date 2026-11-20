'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { VisitsPage } from '@/admin/pages/workforce/AllocationPage';

export default function Page() {
  return (
    <RequirePermission module="allocation">
      <VisitsPage />
    </RequirePermission>
  );
}
