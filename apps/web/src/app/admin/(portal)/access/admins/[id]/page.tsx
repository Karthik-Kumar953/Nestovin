'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { AdminDetailPage } from '@/admin/pages/access/AdminDetailPage';

export default function Page() {
  return (
    <RequirePermission module="admin_access">
      <AdminDetailPage />
    </RequirePermission>
  );
}
