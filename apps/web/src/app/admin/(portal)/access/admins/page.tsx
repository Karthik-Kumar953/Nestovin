'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { AdminsPage } from '@/admin/pages/access/AdminsPage';

export default function Page() {
  return (
    <RequirePermission module="admin_access">
      <AdminsPage />
    </RequirePermission>
  );
}
