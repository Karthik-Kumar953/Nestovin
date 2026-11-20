'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { ResidentsPage } from '@/admin/pages/residents/ResidentsPage';

export default function Page() {
  return (
    <RequirePermission module="residents">
      <ResidentsPage />
    </RequirePermission>
  );
}
