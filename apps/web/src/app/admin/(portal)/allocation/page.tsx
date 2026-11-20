'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { AllocationPage } from '@/admin/pages/workforce/AllocationPage';

export default function Page() {
  return (
    <RequirePermission module="allocation">
      <AllocationPage />
    </RequirePermission>
  );
}
