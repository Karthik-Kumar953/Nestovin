'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { PayrollRunsPage } from '@/admin/pages/finance/PayrollPage';

export default function Page() {
  return (
    <RequirePermission module="finance_payroll">
      <PayrollRunsPage />
    </RequirePermission>
  );
}
