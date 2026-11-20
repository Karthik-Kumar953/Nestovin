'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { HolidaysPage } from '@/admin/pages/support/HolidaysPage';

export default function Page() {
  return (
    <RequirePermission module="support">
      <HolidaysPage />
    </RequirePermission>
  );
}
