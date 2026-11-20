'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { CorrectionsPage } from '@/admin/pages/workforce/AttendancePage';

export default function Page() {
  return (
    <RequirePermission module="attendance">
      <CorrectionsPage />
    </RequirePermission>
  );
}
