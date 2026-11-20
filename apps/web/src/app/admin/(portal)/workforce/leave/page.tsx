'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { LeavePage } from '@/admin/pages/workforce/EmployeesPage';

export default function Page() {
  return (
    <RequirePermission module="employees">
      <LeavePage />
    </RequirePermission>
  );
}
