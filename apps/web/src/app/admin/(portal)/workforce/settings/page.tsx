'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { HrSettingsPage } from '@/admin/pages/workforce/EmployeesPage';

export default function Page() {
  return (
    <RequirePermission module="employees">
      <HrSettingsPage />
    </RequirePermission>
  );
}
