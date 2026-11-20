'use client';

import { RequireAnyPermission } from '@/admin/AdminRoot';
import { SetupPage } from '@/admin/pages/setup/SetupPage';

export default function Page() {
  return (
    <RequireAnyPermission modules={['catalogue_pricing', 'community_migration']}>
      <SetupPage />
    </RequireAnyPermission>
  );
}
