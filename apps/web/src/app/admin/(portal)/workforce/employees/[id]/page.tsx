'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { EmployeeDetailPage } from '@/admin/pages/workforce/EmployeesPage';

export default function Page() {
  return (
    <RequirePermission module="employees">
      <EmployeeDetailPage />
    </RequirePermission>
  );
}
