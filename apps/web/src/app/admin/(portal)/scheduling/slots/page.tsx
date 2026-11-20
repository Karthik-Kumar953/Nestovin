'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { SlotsPage } from '@/admin/pages/demand/SlotsPage';

export default function Page() {
  return (
    <RequirePermission module="scheduling">
      <SlotsPage />
    </RequirePermission>
  );
}
