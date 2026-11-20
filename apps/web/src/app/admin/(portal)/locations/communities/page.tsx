'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { CommunitiesPage } from '@/admin/pages/locations/CommunitiesPage';

export default function Page() {
  return (
    <RequirePermission module="locations">
      <CommunitiesPage />
    </RequirePermission>
  );
}
