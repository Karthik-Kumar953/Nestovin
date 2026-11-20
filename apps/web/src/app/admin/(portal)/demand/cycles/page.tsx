'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { CyclesPage } from '@/admin/pages/demand/CyclesPage';

export default function Page() {
  return (
    <RequirePermission module="demand_payments">
      <CyclesPage />
    </RequirePermission>
  );
}
