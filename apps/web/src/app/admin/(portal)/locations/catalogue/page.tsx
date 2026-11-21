'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { CataloguePage } from '@/admin/pages/locations/CataloguePage';

export default function Page() {
  return (
    <RequirePermission module="locations">
      <CataloguePage />
    </RequirePermission>
  );
}
