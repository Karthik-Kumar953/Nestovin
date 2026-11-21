'use client';

import { useMutation } from '@tanstack/react-query';
import type { ModuleKey } from '@nestovin/contracts';
import { apiDownload } from '../lib/api';
import { can } from '../lib/permissions';
import { useMe } from '../auth/AuthProvider';
import { Button, ErrorBanner, useToast } from './ui';
import { Download } from './icons';

/** CSV export (scope-filtered and audited on the server). Shown only with the module's export permission. */
export function ExportButton({ path, module, fileName }: { path: string; module: ModuleKey; fileName: string }) {
  const me = useMe();
  const toast = useToast();
  const dl = useMutation({ mutationFn: () => apiDownload(path, fileName), onSuccess: () => toast(`${fileName} downloaded`) });
  if (!can(me, module, 'export')) return null;
  return (
    <>
      <Button variant="secondary" icon={Download} busy={dl.isPending} onClick={() => dl.mutate()} title="Exports are limited to your data scope and recorded in the audit log">
        Export CSV
      </Button>
      {dl.error ? <ErrorBanner error={dl.error} /> : null}
    </>
  );
}
