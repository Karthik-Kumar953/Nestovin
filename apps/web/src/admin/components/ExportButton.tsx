'use client';

import { useMutation } from '@tanstack/react-query';
import type { ModuleKey } from '@nestovin/contracts';
import { apiDownload } from '../lib/api';
import { can } from '../lib/permissions';
import { useMe } from '../auth/AuthProvider';
import { Button, ErrorBanner } from './ui';

/** CSV export (scope-filtered and audited on the server). Shown only with the module's export permission. */
export function ExportButton({ path, module, fileName }: { path: string; module: ModuleKey; fileName: string }) {
  const me = useMe();
  const dl = useMutation({ mutationFn: () => apiDownload(path, fileName) });
  if (!can(me, module, 'export')) return null;
  return (
    <>
      <Button variant="ghost" busy={dl.isPending} onClick={() => dl.mutate()}>
        Export CSV
      </Button>
      {dl.error ? <ErrorBanner error={dl.error} /> : null}
    </>
  );
}
