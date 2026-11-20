'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { PaymentsPage } from '@/admin/pages/demand/PaymentsPage';

export default function Page() {
  return (
    <RequirePermission module="demand_payments">
      <PaymentsPage />
    </RequirePermission>
  );
}
