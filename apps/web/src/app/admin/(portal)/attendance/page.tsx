'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { AttendancePage } from '@/admin/pages/workforce/AttendancePage';

export default function Page() {
  return (
    <RequirePermission module="attendance">
      <AttendancePage />
    </RequirePermission>
  );
}
