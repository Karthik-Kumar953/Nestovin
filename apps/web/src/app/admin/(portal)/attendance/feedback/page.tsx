'use client';

import { RequirePermission } from '@/admin/AdminRoot';
import { FeedbackPage } from '@/admin/pages/workforce/FeedbackPage';

export default function Page() {
  return (
    <RequirePermission module="attendance">
      <FeedbackPage />
    </RequirePermission>
  );
}
