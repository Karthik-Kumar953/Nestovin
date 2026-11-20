'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { EnquiriesPage } from '@/admin/pages/support/EnquiriesPage';

export default function Page() {
  return (
    <RequirePermission module="support">
      <EnquiriesPage />
    </RequirePermission>
  );
}
