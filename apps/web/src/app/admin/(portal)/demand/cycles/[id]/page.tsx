'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { CycleDetailPage } from '@/admin/pages/demand/CycleDetailPage';

export default function Page() {
  return (
    <RequirePermission module="demand_payments">
      <CycleDetailPage />
    </RequirePermission>
  );
}
