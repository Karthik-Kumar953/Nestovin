'use client';

import { NotFoundPage } from '@/admin/pages/HomePage';

/** Unknown /admin/* paths show the in-portal "not found" state (after sign-in). */
export default function Page() {
  return <NotFoundPage />;
}
