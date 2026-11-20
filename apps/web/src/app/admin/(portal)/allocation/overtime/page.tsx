'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { OvertimePage } from '@/admin/pages/workforce/OvertimePage';

export default function Page() {
  return (
    <RequirePermission module="allocation">
      <OvertimePage />
    </RequirePermission>
  );
}
