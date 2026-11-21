'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { MigrationPage } from '@/admin/pages/locations/MigrationPage';

export default function Page() {
  return (
    <RequirePermission module="locations">
      <MigrationPage />
    </RequirePermission>
  );
}
