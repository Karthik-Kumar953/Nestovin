'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { EmployeesPage } from '@/admin/pages/workforce/EmployeesPage';

export default function Page() {
  return (
    <RequirePermission module="employees">
      <EmployeesPage />
    </RequirePermission>
  );
}
