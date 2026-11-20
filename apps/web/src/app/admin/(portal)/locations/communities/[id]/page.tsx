'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { CommunityDetailPage } from '@/admin/pages/locations/CommunityDetailPage';

export default function Page() {
  return (
    <RequirePermission module="locations">
      <CommunityDetailPage />
    </RequirePermission>
  );
}
