'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { ExpansionVotesPage } from '@/admin/pages/locations/ExpansionVotesPage';

export default function Page() {
  return (
    <RequirePermission module="locations">
      <ExpansionVotesPage />
    </RequirePermission>
  );
}
