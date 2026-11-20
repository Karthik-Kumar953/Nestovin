'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { CitiesPage } from '@/admin/pages/locations/CitiesPage';

export default function Page() {
  return (
    <RequirePermission module="locations">
      <CitiesPage />
    </RequirePermission>
  );
}
