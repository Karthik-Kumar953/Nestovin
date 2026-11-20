'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { ClustersPage } from '@/admin/pages/locations/ClustersPage';

export default function Page() {
  return (
    <RequirePermission module="locations">
      <ClustersPage />
    </RequirePermission>
  );
}
