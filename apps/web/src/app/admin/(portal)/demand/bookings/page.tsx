'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { BookingsPage } from '@/admin/pages/demand/PaymentsPage';

export default function Page() {
  return (
    <RequirePermission module="demand_payments">
      <BookingsPage />
    </RequirePermission>
  );
}
