'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { RolesPage } from '@/admin/pages/access/RolesPage';

export default function Page() {
  return (
    <RequirePermission module="admin_access">
      <RolesPage />
    </RequirePermission>
  );
}
